// backend/src/features/teams/team.controller.js
const teamService = require('./team.service');
const logger = require('../../shared/utils/logger');

/**
 * Create a new team
 */
const createTeam = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { name, settings } = req.body;

    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Team name is required'
      });
    }

    const team = await teamService.createTeam(userId, { name, settings });

    res.status(201).json({
      status: 'success',
      data: team
    });
  } catch (error) {
    logger.error(`Error creating team: ${error.message}`);
    next(error);
  }
};

/**
 * Get all teams for the current user
 */
const getUserTeams = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const teams = await teamService.getUserTeams(userId);

    res.status(200).json({
      status: 'success',
      data: teams
    });
  } catch (error) {
    logger.error(`Error getting user teams: ${error.message}`);
    next(error);
  }
};

/**
 * Get a team by ID with all members
 */
const getTeamDetails = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const team = await teamService.getTeamWithMembers(teamId);

    res.status(200).json({
      status: 'success',
      data: team
    });
  } catch (error) {
    logger.error(`Error getting team details: ${error.message}`);
    next(error);
  }
};

/**
 * Update team settings
 */
const updateTeamSettings = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { settings } = req.body;

    if (!settings) {
      return res.status(400).json({
        status: 'error',
        message: 'Settings are required'
      });
    }

    const team = await teamService.updateTeamSettings(teamId, settings);

    res.status(200).json({
      status: 'success',
      data: team
    });
  } catch (error) {
    logger.error(`Error updating team settings: ${error.message}`);
    next(error);
  }
};

/**
 * Invite a user to a team
 */
const inviteUserToTeam = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required'
      });
    }

    const invite = await teamService.inviteUserToTeam(teamId, userId, email, role);

    res.status(201).json({
      status: 'success',
      data: invite
    });
  } catch (error) {
    if (error.message === 'User is already a member of this team' ||
        error.message === 'User already has a pending invitation') {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }
    logger.error(`Error inviting user to team: ${error.message}`);
    next(error);
  }
};

/**
 * Get pending invites for the current user
 */
const getPendingInvites = async (req, res, next) => {
  try {
    const email = req.user.email;
    const invites = await teamService.getPendingInvitesByEmail(email);

    res.status(200).json({
      status: 'success',
      data: invites
    });
  } catch (error) {
    logger.error(`Error getting pending invites: ${error.message}`);
    next(error);
  }
};

/**
 * Accept a team invitation
 */
const acceptInvite = async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    const userId = req.user._id;

    const result = await teamService.acceptTeamInvite(inviteId, userId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    if (error.message.includes('Invitation') ||
        error.message === 'You are already a member of this team') {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }
    logger.error(`Error accepting invite: ${error.message}`);
    next(error);
  }
};

/**
 * Reject a team invitation
 */
const rejectInvite = async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    const userId = req.user._id;

    const result = await teamService.rejectTeamInvite(inviteId, userId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    if (error.message.includes('Invitation')) {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }
    logger.error(`Error rejecting invite: ${error.message}`);
    next(error);
  }
};

/**
 * Update a team member's role
 */
const updateMemberRole = async (req, res, next) => {
  try {
    const { teamId, memberId } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid role (admin or member) is required'
      });
    }

    const result = await teamService.updateMemberRole(teamId, memberId, role);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    if (error.message === 'Team member not found' ||
        error.message === 'Cannot demote the last admin of the team') {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }
    logger.error(`Error updating member role: ${error.message}`);
    next(error);
  }
};

/**
 * Remove a member from a team
 */
const removeMember = async (req, res, next) => {
  try {
    const { teamId, memberId } = req.params;

    const result = await teamService.removeMember(teamId, memberId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    if (error.message === 'Team member not found' ||
        error.message === 'Cannot remove the last admin of the team') {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }
    logger.error(`Error removing team member: ${error.message}`);
    next(error);
  }
};

/**
 * Get all datasets for a team
 */
const getTeamDatasets = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const datasets = await teamService.getTeamDatasets(teamId);

    res.status(200).json({
      status: 'success',
      data: datasets
    });
  } catch (error) {
    logger.error(`Error getting team datasets: ${error.message}`);
    next(error);
  }
};

module.exports = {
  createTeam,
  getUserTeams,
  getTeamDetails,
  updateTeamSettings,
  inviteUserToTeam,
  getPendingInvites,
  acceptInvite,
  rejectInvite,
  updateMemberRole,
  removeMember,
  getTeamDatasets
};