// frontend/src/features/team_management/pages/TeamDetailsPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../../../shared/services/apiClient';
import { useAuth } from '../../../shared/hooks/useAuth';
import Card from '../../../shared/ui/Card';
import Button from '../../../shared/ui/Button';
import Spinner from '../../../shared/ui/Spinner';
import TeamSettingsForm from '../components/TeamSettingsForm';
import MemberList from '../components/MemberList';
import InviteForm from '../components/InviteForm';
import TeamDatasetList from '../components/TeamDatasetList';
import { ArrowLeftIcon, UserGroupIcon, UserPlusIcon } from '@heroicons/react/24/outline';

const TeamDetailsPage = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth(); // Get current user

  const [team, setTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('members');
  const [datasets, setDatasets] = useState([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);

  // Fetch team details
  useEffect(() => {
    const fetchTeamDetails = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.get(`/teams/${teamId}`);
        if (response.data.status === 'success') {
          const teamData = response.data.data;
          setTeam(teamData);

          // Check if current user is in the members list and is an admin
          const members = teamData.members || [];
          setTeamMembers(members);

          // Find the current user by email
          const currentUserMember = members.find(member =>
            member.email === user.email
          );

          // Set admin status
          if (currentUserMember && currentUserMember.role === 'admin') {
            setIsAdmin(true);
            console.log("User is an admin");
          } else {
            console.log("User is NOT an admin");
          }
        }
      } catch (err) {
        console.error("Error fetching team details:", err);
        setError(err.response?.data?.message || err.message || 'Could not load team details');
      } finally {
        setIsLoading(false);
      }
    };

    if (teamId) {
      fetchTeamDetails();
    }
  }, [teamId, user.email]);

  // Fetch team datasets
  useEffect(() => {
    const fetchTeamDatasets = async () => {
      if (!teamId) return;

      setDatasetsLoading(true);
      try {
        const response = await apiClient.get(`/teams/${teamId}/datasets`);
        if (response.data.status === 'success') {
          setDatasets(response.data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch team datasets:", err);
      } finally {
        setDatasetsLoading(false);
      }
    };

    // Only fetch datasets when on datasets tab
    if (activeTab === 'datasets') {
      fetchTeamDatasets();
    }
  }, [teamId, activeTab]);

  // Function to invite a user to the team
  const inviteUser = async (email, role) => {
    try {
      await apiClient.post(`/teams/${teamId}/invites`, { email, role });
      // Refresh team members
      const response = await apiClient.get(`/teams/${teamId}`);
      if (response.data.status === 'success') {
        setTeam(response.data.data);
        setTeamMembers(response.data.data.members || []);
      }
      return true;
    } catch (err) {
      console.error("Failed to invite user:", err);
      throw new Error(err.response?.data?.message || 'Could not invite user');
    }
  };

  // Function to update team settings
  const updateTeamSettings = async (settings) => {
    try {
      const response = await apiClient.put(`/teams/${teamId}/settings`, { settings });
      if (response.data.status === 'success') {
        setTeam(prev => ({
          ...prev,
          settings: response.data.data.settings
        }));
      }
      return true;
    } catch (err) {
      console.error("Failed to update team settings:", err);
      throw new Error(err.response?.data?.message || 'Could not update settings');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-200 dark:border-rose-800">
        <Card.Body className="text-rose-600 dark:text-rose-400 p-4">
          <p>Error loading team details: {error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate('/account/teams')}
            leftIcon={ArrowLeftIcon}
          >
            Back to Teams
          </Button>
        </Card.Body>
      </Card>
    );
  }

  if (!team) {
    return (
      <Card>
        <Card.Body className="p-4">
          <p>Team not found.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate('/account/teams')}
            leftIcon={ArrowLeftIcon}
          >
            Back to Teams
          </Button>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/account/teams')}
            leftIcon={ArrowLeftIcon}
          >
            Back
          </Button>
          <div className="flex items-center">
            <UserGroupIcon className="h-6 w-6 text-blue-500 mr-2" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {team.name}
            </h1>
          </div>
        </div>
        {isAdmin && (
          <div className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full">
            Administrator
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            className={`${
              activeTab === 'members'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('members')}
          >
            Members
          </button>
          <button
            className={`${
              activeTab === 'datasets'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            onClick={() => setActiveTab('datasets')}
          >
            Datasets
          </button>
          {isAdmin && (
            <button
              className={`${
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'members' && (
          <div className="space-y-6">
            {/* Invite Member Button - directly implement invite UI here for simplicity */}
            {isAdmin && (
              <Card>
                <Card.Header>
                  <div className="flex items-center">
                    <UserPlusIcon className="h-5 w-5 text-blue-500 mr-2" />
                    <span>Invite Team Member</span>
                  </div>
                </Card.Header>
                <Card.Body>
                  <InviteForm
                    teamId={teamId}
                    onInvite={inviteUser}
                  />
                </Card.Body>
              </Card>
            )}

            {/* Member List */}
            <Card>
              <Card.Header>Team Members</Card.Header>
              <Card.Body>
                {teamMembers.length === 0 ? (
                  <p className="text-gray-500">No members in this team.</p>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {teamMembers.map((member) => (
                      <li key={member._id || member.email} className="py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              {member.role === 'admin' ? (
                                <svg className="h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                              ) : (
                                <svg className="h-6 w-6 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            <h3 className="font-medium">{member.name || member.email}</h3>
                            <p className="text-sm text-gray-500">{member.email}</p>
                            <p className="text-sm text-gray-500">{member.role === 'admin' ? 'Administrator' : 'Member'}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card.Body>
            </Card>
          </div>
        )}

        {activeTab === 'datasets' && (
          <TeamDatasetList
            teamId={teamId}
            datasets={datasets}
            isLoading={datasetsLoading}
            isAdmin={isAdmin}
          />
        )}

        {activeTab === 'settings' && isAdmin && (
          <TeamSettingsForm
            teamId={teamId}
            initialSettings={team.settings || {}}
            onUpdateSettings={updateTeamSettings}
          />
        )}
      </div>
    </div>
  );
};

export default TeamDetailsPage;