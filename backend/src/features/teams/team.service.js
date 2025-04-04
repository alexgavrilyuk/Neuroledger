// backend/src/features/teams/team.service.js
const mongoose = require('mongoose');
const Team = require('./team.model');
const TeamMember = require('./team-member.model');
const TeamInvite = require('./team-invite.model');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const NotificationService = require('../notifications/notification.service');
const logger = require('../../shared/utils/logger');

/**
 * Create a new team with the provided user as owner and admin
 */
const createTeam = async (userId, teamData) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Create the team
    const team = new Team({
      name: teamData.name,
      settings: teamData.settings || {},
      ownerId: userId,
    });

    await team.save({ session });

    // Add the creator as an admin
    const teamMember = new TeamMember({
      teamId: team._id,
      userId: userId,
      role: 'admin',
    });

    await teamMember.save({ session });

    // Update user's teams array (if using this approach)
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { teams: team._id } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    logger.info(`User ${userId} created team ${team._id}`);
    return team;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Error creating team for user ${userId}: ${error.message}`);
    throw error;
  }
};

/**
 * Get all teams a user is a member of
 */
const getUserTeams = async (userId) => {
  try {
    // Get all team memberships
    const teamMemberships = await TeamMember.find({ userId })
      .select('teamId role')
      .lean();

    if (!teamMemberships.length) return [];

    // Get all teams
    const teamIds = teamMemberships.map(membership => membership.teamId);
    const teams = await Team.find({ _id: { $in: teamIds } }).lean();

    // Combine team data with role information
    return teams.map(team => {
      const membership = teamMemberships.find(m =>
        m.teamId.toString() === team._id.toString()
      );
      return {
        ...team,
        userRole: membership.role
      };
    });
  } catch (error) {
    logger.error(`Error getting teams for user ${userId}: ${error.message}`);
    throw error;
  }
};

/**
 * Get a team by ID with all members
 */
const getTeamWithMembers = async (teamId) => {
  try {
    // Get the team
    const team = await Team.findById(teamId).lean();
    if (!team) {
      throw new Error('Team not found');
    }

    // Get all members with their roles
    const members = await TeamMember.find({ teamId })
      .populate('userId', 'name email')
      .lean();

    return {
      ...team,
      members: members.map(m => ({
        _id: m.userId._id,
        name: m.userId.name,
        email: m.userId.email,
        role: m.role,
        joinedAt: m.joinedAt
      }))
    };
  } catch (error) {
    logger.error(`Error getting team ${teamId} with members: ${error.message}`);
    throw error;
  }
};

/**
 * Update team settings
 */
const updateTeamSettings = async (teamId, settings) => {
  try {
    const team = await Team.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Update settings
    team.settings = {
      ...team.settings,
      ...settings
    };
    team.updatedAt = new Date();

    await team.save();
    logger.info(`Team ${teamId} settings updated`);
    return team;
  } catch (error) {
    logger.error(`Error updating team ${teamId} settings: ${error.message}`);
    throw error;
  }
};

/**
 * Invite a user to join a team
 */
const inviteUserToTeam = async (teamId, invitedByUserId, inviteeEmail, role = 'member') => {
  try {
    // Check if the user is already a member
    const existingUser = await User.findOne({ email: inviteeEmail }).select('_id').lean();

    if (existingUser) {
      const existingMember = await TeamMember.findOne({
        teamId,
        userId: existingUser._id
      }).lean();

      if (existingMember) {
        throw new Error('User is already a member of this team');
      }
    }

    // Check if there's already a pending invite
    const existingInvite = await TeamInvite.findOne({
      teamId,
      inviteeEmail,
      status: 'pending'
    }).lean();

    if (existingInvite) {
      throw new Error('User already has a pending invitation');
    }

    // Create the invite
    const invite = new TeamInvite({
      teamId,
      invitedByUserId,
      inviteeEmail,
      role
    });

    await invite.save();

    // Get team information for the notification
    const team = await Team.findById(teamId).select('name').lean();

    // Create a notification for the invitee if they are already a user
    if (existingUser) {
      await NotificationService.createNotification({
        userId: existingUser._id,
        type: 'team_invite',
        title: 'Team Invitation',
        message: `You have been invited to join ${team.name}`,
        data: {
          inviteId: invite._id,
          teamId,
          teamName: team.name
        }
      });
    }

    logger.info(`User ${invitedByUserId} invited ${inviteeEmail} to team ${teamId}`);
    return invite;
  } catch (error) {
    logger.error(`Error inviting user to team ${teamId}: ${error.message}`);
    throw error;
  }
};

/**
 * Get pending invites for a user by email
 */
const getPendingInvitesByEmail = async (email) => {
  try {
    const invites = await TeamInvite.find({
      inviteeEmail: email.toLowerCase(),
      status: 'pending',
      expiresAt: { $gt: new Date() }
    })
    .populate('teamId', 'name')
    .populate('invitedByUserId', 'name email')
    .lean();

    return invites.map(invite => ({
      _id: invite._id,
      teamId: invite.teamId._id,
      teamName: invite.teamId.name,
      invitedBy: {
        name: invite.invitedByUserId.name,
        email: invite.invitedByUserId.email
      },
      role: invite.role,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt
    }));
  } catch (error) {
    logger.error(`Error getting pending invites for ${email}: ${error.message}`);
    throw error;
  }
};

/**
 * Accept a team invitation
 */
const acceptTeamInvite = async (inviteId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find and validate the invite
    const invite = await TeamInvite.findById(inviteId).session(session);
    if (!invite) {
      throw new Error('Invitation not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invitation has already been processed');
    }

    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save({ session });
      throw new Error('Invitation has expired');
    }

    // Verify the user's email matches the invite
    const user = await User.findById(userId).select('email').session(session);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.email.toLowerCase() !== invite.inviteeEmail.toLowerCase()) {
      throw new Error('This invitation was not sent to your email address');
    }

    // Check if user is already a member
    const existingMember = await TeamMember.findOne({
      teamId: invite.teamId,
      userId
    }).session(session);

    if (existingMember) {
      invite.status = 'accepted';
      await invite.save({ session });
      throw new Error('You are already a member of this team');
    }

    // Create team membership
    const teamMember = new TeamMember({
      teamId: invite.teamId,
      userId,
      role: invite.role,
    });

    await teamMember.save({ session });

    // Update user's teams array
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { teams: invite.teamId } },
      { session }
    );

    // Update invite status
    invite.status = 'accepted';
    await invite.save({ session });

    // Get team information
    const team = await Team.findById(invite.teamId).select('name').session(session);

    await session.commitTransaction();
    session.endSession();

    // Create a notification for the user
    await NotificationService.createNotification({
      userId,
      type: 'team_join',
      title: 'Team Joined',
      message: `You have successfully joined ${team.name}`,
      data: {
        teamId: invite.teamId,
        teamName: team.name
      }
    });

    logger.info(`User ${userId} accepted invitation to team ${invite.teamId}`);
    return { teamId: invite.teamId, role: invite.role };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Error accepting team invite ${inviteId}: ${error.message}`);
    throw error;
  }
};

/**
 * Reject a team invitation
 */
const rejectTeamInvite = async (inviteId, userId) => {
  try {
    // Find and validate the invite
    const invite = await TeamInvite.findById(inviteId);
    if (!invite) {
      throw new Error('Invitation not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invitation has already been processed');
    }

    // Verify the user's email matches the invite
    const user = await User.findById(userId).select('email');
    if (user.email.toLowerCase() !== invite.inviteeEmail.toLowerCase()) {
      throw new Error('This invitation was not sent to your email address');
    }

    // Update invite status
    invite.status = 'rejected';
    await invite.save();

    logger.info(`User ${userId} rejected invitation to team ${invite.teamId}`);
    return { success: true };
  } catch (error) {
    logger.error(`Error rejecting team invite ${inviteId}: ${error.message}`);
    throw error;
  }
};

/**
 * Update a team member's role
 */
const updateMemberRole = async (teamId, memberUserId, newRole) => {
  try {
    const teamMember = await TeamMember.findOne({
      teamId,
      userId: memberUserId
    });

    if (!teamMember) {
      throw new Error('Team member not found');
    }

    // Check if this is the last admin
    if (teamMember.role === 'admin' && newRole === 'member') {
      const adminCount = await TeamMember.countDocuments({
        teamId,
        role: 'admin'
      });

      if (adminCount <= 1) {
        throw new Error('Cannot demote the last admin of the team');
      }
    }

    // Update the role
    teamMember.role = newRole;
    await teamMember.save();

    // Create a notification for the user
    await NotificationService.createNotification({
      userId: memberUserId,
      type: 'team_role_change',
      title: 'Role Updated',
      message: `Your role in the team has been updated to ${newRole}`,
      data: {
        teamId,
        role: newRole
      }
    });

    logger.info(`Updated user ${memberUserId} role to ${newRole} in team ${teamId}`);
    return teamMember;
  } catch (error) {
    logger.error(`Error updating member role in team ${teamId}: ${error.message}`);
    throw error;
  }
};

/**
 * Remove a member from a team
 */
const removeMember = async (teamId, memberUserId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const teamMember = await TeamMember.findOne({
      teamId,
      userId: memberUserId
    }).session(session);

    if (!teamMember) {
      throw new Error('Team member not found');
    }

    // Check if this is the last admin
    if (teamMember.role === 'admin') {
      const adminCount = await TeamMember.countDocuments({
        teamId,
        role: 'admin'
      }).session(session);

      if (adminCount <= 1) {
        throw new Error('Cannot remove the last admin of the team');
      }
    }

    // Remove the team member
    await TeamMember.deleteOne({
      teamId,
      userId: memberUserId
    }).session(session);

    // Update user's teams array
    await User.findByIdAndUpdate(
      memberUserId,
      { $pull: { teams: teamId } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Get team information for notification
    const team = await Team.findById(teamId).select('name').lean();

    // Create a notification for the user
    await NotificationService.createNotification({
      userId: memberUserId,
      type: 'system',
      title: 'Removed from Team',
      message: `You have been removed from ${team.name}`,
      data: {
        teamId,
        teamName: team.name
      }
    });

    logger.info(`Removed user ${memberUserId} from team ${teamId}`);
    return { success: true };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`Error removing member from team ${teamId}: ${error.message}`);
    throw error;
  }
};

/**
 * Get all datasets belonging to a team
 */
const getTeamDatasets = async (teamId) => {
  try {
    const datasets = await Dataset.find({ teamId })
      .sort({ createdAt: -1 })
      .lean();

    return datasets;
  } catch (error) {
    logger.error(`Error getting datasets for team ${teamId}: ${error.message}`);
    throw error;
  }
};

module.exports = {
  createTeam,
  getUserTeams,
  getTeamWithMembers,
  updateTeamSettings,
  inviteUserToTeam,
  getPendingInvitesByEmail,
  acceptTeamInvite,
  rejectTeamInvite,
  updateMemberRole,
  removeMember,
  getTeamDatasets
};