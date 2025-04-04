// backend/src/features/teams/team.middleware.js
const TeamMember = require('./team-member.model');
const logger = require('../../shared/utils/logger');

/**
 * Middleware to check if the user is a member of the team
 */
const isTeamMember = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { teamId } = req.params;

    const membership = await TeamMember.findOne({
      teamId,
      userId
    }).lean();

    if (!membership) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not a member of this team'
      });
    }

    // Add the user's role to the request object for later use
    req.userTeamRole = membership.role;
    next();
  } catch (error) {
    logger.error(`Error in isTeamMember middleware: ${error.message}`);
    next(error);
  }
};

/**
 * Middleware to check if the user is an admin of the team
 */
const isTeamAdmin = async (req, res, next) => {
  try {
    // If already checked by isTeamMember middleware
    if (req.userTeamRole) {
      if (req.userTeamRole !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'You do not have admin permissions for this team'
        });
      }
      return next();
    }

    const userId = req.user._id;
    const { teamId } = req.params;

    const membership = await TeamMember.findOne({
      teamId,
      userId,
      role: 'admin'
    }).lean();

    if (!membership) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have admin permissions for this team'
      });
    }

    req.userTeamRole = 'admin';
    next();
  } catch (error) {
    logger.error(`Error in isTeamAdmin middleware: ${error.message}`);
    next(error);
  }
};

module.exports = {
  isTeamMember,
  isTeamAdmin
};