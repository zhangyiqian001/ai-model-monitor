import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import DashboardPage from './pages/Dashboard/DashboardPage';
import PlatformsPage from './pages/Platforms/PlatformsPage';
import PlatformDetailPage from './pages/PlatformDetail/PlatformDetailPage';
import ModelsPage from './pages/Models/ModelsPage';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="platforms" element={<PlatformsPage />} />
        <Route path="platforms/:platformKey" element={<PlatformDetailPage />} />
        <Route path="models" element={<ModelsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
