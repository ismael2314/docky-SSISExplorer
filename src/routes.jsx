import { createBrowserRouter } from 'react-router-dom'
import { DefaultLayout } from './layout/default'
import { Details } from './pages/display'
import HomePage from './pages/home'
import DataFlowPage from './pages/dataflow'
import HierarchyPage from './pages/hierarchy'
import JobsPage from './pages/jobs'
import TracePage from './pages/trace'
import SearchPage from './pages/search'
import SettingsPage from './pages/setting'
import NotFoundPage from './pages/not-found'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DefaultLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'packages/:packageId', element: <Details /> },
      { path: 'packages/:packageId/dataflow/:taskId', element: <DataFlowPage /> },
      { path: 'hierarchy', element: <HierarchyPage /> },
      { path: 'hierarchy/:packageId', element: <HierarchyPage /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'trace', element: <TracePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
