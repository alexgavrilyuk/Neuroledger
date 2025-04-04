// frontend/src/features/team_management/components/CreateTeamForm.jsx
import React, { useState } from 'react';
import Input from '../../../shared/ui/Input';
import Button from '../../../shared/ui/Button';
import Card from '../../../shared/ui/Card';
import { UserGroupIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useTeams } from '../hooks/useTeams';

const CreateTeamForm = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const { createTeam, isLoading } = useTeams();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Team name is required');
      return;
    }

    try {
      const newTeam = await createTeam({ name });
      setName('');
      setShowForm(false);
      setError(null);
      if (onSuccess) onSuccess(newTeam);
    } catch (err) {
      setError(err.message || 'Failed to create team');
    }
  };

  if (!showForm) {
    return (
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => setShowForm(true)}
          className="w-full"
          leftIcon={PlusIcon}
        >
          Create New Team
        </Button>
      </div>
    );
  }

  return (
    <Card className="mb-6 overflow-visible">
      <Card.Header>
        <div className="flex items-center">
          <UserGroupIcon className="h-5 w-5 text-blue-500 mr-2" />
          <span>Create New Team</span>
        </div>
      </Card.Header>
      <Card.Body>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Team Name"
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error}
            required
          />
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setName('');
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              disabled={isLoading || !name.trim()}
            >
              Create Team
            </Button>
          </div>
        </form>
      </Card.Body>
    </Card>
  );
};

export default CreateTeamForm;