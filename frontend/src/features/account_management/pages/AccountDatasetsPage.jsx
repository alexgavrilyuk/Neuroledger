// frontend/src/features/account_management/pages/AccountDatasetsPage.jsx
// ** NEW FILE **
import React from 'react';
import DatasetList from '../../dataset_management/components/DatasetList';
import DatasetUpload from '../../dataset_management/components/DatasetUpload';
import { useDatasets } from '../../dataset_management/hooks/useDatasets'; // Import hook for refetch

const AccountDatasetsPage = () => {
    const { refetch: refetchDatasets } = useDatasets(); // Get refetch function

    return (
        <div className="space-y-6">
             {/* Pass refetch function to trigger list update after successful upload */}
            <DatasetUpload onUploadComplete={refetchDatasets} />
            <DatasetList />
        </div>
    );
};

export default AccountDatasetsPage;