// frontend/src/features/account_management/pages/AccountTeamsPage.jsx
import React from 'react';
import CreateTeamForm from '../../team_management/components/CreateTeamForm';
import TeamList from '../../team_management/components/TeamList';
import PendingInvites from '../../team_management/components/PendingInvites';

const AccountTeamsPage = () => {
  return (
    <div className="space-y-6">
      <CreateTeamForm />
      <PendingInvites />
      <TeamList />
    </div>
  );
};

export default AccountTeamsPage;