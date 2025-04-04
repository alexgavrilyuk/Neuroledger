// backend/src/features/teams/team.routes.js
const express = require('express');
const teamController = require('./team.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { isTeamMember, isTeamAdmin } = require('./team.middleware');

const router = express.Router();

// Protect all team routes
router.use(protect);

// Team routes
router.post('/', teamController.createTeam);
router.get('/', teamController.getUserTeams);

// Routes requiring team membership
router.get('/:teamId', isTeamMember, teamController.getTeamDetails);
router.get('/:teamId/datasets', isTeamMember, teamController.getTeamDatasets);

// Routes requiring team admin role
router.put('/:teamId/settings', isTeamAdmin, teamController.updateTeamSettings);
router.post('/:teamId/invites', isTeamAdmin, teamController.inviteUserToTeam);
router.put('/:teamId/members/:memberId/role', isTeamAdmin, teamController.updateMemberRole);
router.delete('/:teamId/members/:memberId', isTeamAdmin, teamController.removeMember);

// Invite routes
router.get('/invites/pending', teamController.getPendingInvites);
router.post('/invites/:inviteId/accept', teamController.acceptInvite);
router.post('/invites/:inviteId/reject', teamController.rejectInvite);

module.exports = router;