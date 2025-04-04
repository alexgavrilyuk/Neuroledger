// frontend/src/features/account_management/pages/AccountTeamsPage.jsx
import React from 'react';
import CreateTeamForm from '../../team_management/components/CreateTeamForm';
import TeamList from '../../team_management/components/TeamList';
import PendingInvites from '../../team_management/components/PendingInvites';
import { useTeams } from '../../team_management/hooks/useTeams';

const AccountTeamsPage = () => {
  const { refetch } = useTeams();

  return (
    <div className="space-y-6">
      {/* Pending Invites - Will only render if there are invites */}
      <PendingInvites />

      {/* Create Team Form */}
      <CreateTeamForm onSuccess={() => {
        refetch();
      }} />

      {/* Team List */}
      <TeamList />
    </div>
  );
};

export default AccountTeamsPage;