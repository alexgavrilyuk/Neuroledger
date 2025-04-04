// frontend/src/features/team_management/components/MemberList.jsx
import React, { useState } from 'react';
import Card from '../../../shared/ui/Card';
import Button from '../../../shared/ui/Button';
import {
  UserGroupIcon,
  UserIcon,
  ShieldCheckIcon,
  TrashIcon,
  UserMinusIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import Modal from '../../../shared/ui/Modal';
import { useTeamDetails } from '../hooks/useTeamDetails';

const MemberList = ({ teamId, members = [], isAdmin, onMemberUpdated }) => {
  const { updateMemberRole, removeMember, isLoading } = useTeamDetails(teamId);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [error, setError] = useState(null);

  const handleRoleChange = async (role) => {
    if (!selectedMember) return;

    setError(null);
    try {
      await updateMemberRole(selectedMember._id, role);
      setShowRoleModal(false);
      setSelectedMember(null);
      if (onMemberUpdated) onMemberUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update member role');
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToDelete) return;

    setError(null);
    try {
      await removeMember(memberToDelete._id);
      setMemberToDelete(null);
      if (onMemberUpdated) onMemberUpdated();
    } catch (err) {
      setError(err.message || 'Failed to remove member');
    }
  };

  if (!members || members.length === 0) {
    return (
      <Card>
        <Card.Body className="text-center py-8">
          <UserGroupIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Team Members</h3>
          <p className="text-gray-500 dark:text-gray-400">
            {isAdmin
              ? "This team doesn't have any members yet. Invite people to collaborate!"
              : "This team doesn't have any members yet."}
          </p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Card.Header>
          <div className="flex items-center">
            <UserGroupIcon className="h-5 w-5 text-blue-500 mr-2" />
            <span>Team Members</span>
          </div>
        </Card.Header>
        <div className="overflow-hidden">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {members.map((member) => (
              <li key={member._id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      {member.role === 'admin' ? (
                        <ShieldCheckIcon className="h-6 w-6 text-blue-500" />
                      ) : (
                        <UserIcon className="h-6 w-6 text-gray-500" />
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {member.name || 'Unnamed User'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {member.email}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {member.role === 'admin' ? 'Administrator' : 'Member'} • Joined {format(new Date(member.joinedAt), 'MMM dd, yyyy')}
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedMember(member);
                          setShowRoleModal(true);
                        }}
                      >
                        Change Role
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300"
                        leftIcon={UserMinusIcon}
                        onClick={() => setMemberToDelete(member)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* Change Role Modal */}
      <Modal
        isOpen={showRoleModal}
        onClose={() => {
          setShowRoleModal(false);
          setSelectedMember(null);
          setError(null);
        }}
        title="Change Member Role"
      >
        <Modal.Body>
          {selectedMember && (
            <div className="space-y-4">
              <p>
                Change role for <span className="font-medium">{selectedMember.name || selectedMember.email}</span>:
              </p>

              <div className="space-y-2">
                <div
                  className={`p-3 border ${
                    selectedMember.role === 'admin'
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-700'
                  } rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800`}
                  onClick={() => handleRoleChange('admin')}
                >
                  <div className="flex items-center">
                    <ShieldCheckIcon className="h-5 w-5 text-blue-500 mr-2" />
                    <div>
                      <h3 className="font-medium">Administrator</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Can manage team settings, members, and datasets</p>
                    </div>
                  </div>
                </div>

                <div
                  className={`p-3 border ${
                    selectedMember.role === 'member'
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-700'
                  } rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800`}
                  onClick={() => handleRoleChange('member')}
                >
                  <div className="flex items-center">
                    <UserIcon className="h-5 w-5 text-gray-500 mr-2" />
                    <div>
                      <h3 className="font-medium">Member</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Can view team content and datasets</p>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="text-sm text-rose-600 dark:text-rose-400 p-2 bg-rose-50 dark:bg-rose-900/20 rounded-md">
                  {error}
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="ghost"
            onClick={() => {
              setShowRoleModal(false);
              setSelectedMember(null);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Remove Member Modal */}
      <Modal
        isOpen={!!memberToDelete}
        onClose={() => {
          setMemberToDelete(null);
          setError(null);
        }}
        title="Remove Team Member"
      >
        <Modal.Body>
          {memberToDelete && (
            <div className="space-y-4">
              <p>
                Are you sure you want to remove <span className="font-medium">{memberToDelete.name || memberToDelete.email}</span> from this team?
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This action cannot be undone. The user will lose access to all team datasets and settings.
              </p>

              {error && (
                <div className="text-sm text-rose-600 dark:text-rose-400 p-2 bg-rose-50 dark:bg-rose-900/20 rounded-md">
                  {error}
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="ghost"
            onClick={() => {
              setMemberToDelete(null);
              setError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            leftIcon={TrashIcon}
            onClick={handleRemoveMember}
            isLoading={isLoading}
          >
            Remove Member
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default MemberList;