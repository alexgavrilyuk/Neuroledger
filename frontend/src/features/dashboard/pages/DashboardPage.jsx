// frontend/src/features/dashboard/pages/DashboardPage.jsx
// ** UPDATED FILE - Slightly better structure **
import React from 'react';
import { useAuth } from '../../../shared/hooks/useAuth';
import Card from '../../../shared/ui/Card';

const DashboardPage = () => {
    const { user } = useAuth();

    return (
        <div className="space-y-6">
            {/* Page Header */}
             <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    Dashboard
                </h1>
                {/* Add actions here later if needed */}
            </div>

            {/* Main Content Area */}
            <Card>
                <Card.Body>
                    <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Welcome back, {user?.name || user?.email}!</h2>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        This is the main application area. The chat interface and prompt input will go here in later phases.
                    </p>
                    {/* Future components will replace this */}
                </Card.Body>
            </Card>

            {/* Add more sections/cards as needed */}

        </div>
    );
};

export default DashboardPage;