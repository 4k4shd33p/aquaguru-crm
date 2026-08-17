import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { LoadingScreen } from '../components/feedback/LoadingScreen'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { DashboardPage } from '../pages/DashboardPage'
import { CustomerDetailPage } from '../pages/CustomerDetailPage'
import { CustomersPage } from '../pages/CustomersPage'
import { EquipmentDetailPage } from '../pages/EquipmentDetailPage'
import { EquipmentPage } from '../pages/EquipmentPage'
import { LoginPage } from '../pages/LoginPage'
import { SalesPage } from '../pages/SalesPage'
import { NewSalePage } from '../pages/NewSalePage'
import { SaleDetailPage } from '../pages/SaleDetailPage'

function RequireAuth() {
  const { isLoading, session } = useAuth()
  if (isLoading) return <LoadingScreen label="Restoring your session" />
  return session ? <Outlet /> : <Navigate to="/login" replace />
}

function PublicOnly() {
  const { isLoading, session } = useAuth()
  if (isLoading) return <LoadingScreen label="Restoring your session" />
  return session ? <Navigate to="/dashboard" replace /> : <Outlet />
}

export const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [{ path: '/login', element: <AuthLayout><LoginPage /></AuthLayout> }],
  },
  {
    element: <RequireAuth />,
    children: [{
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: '/dashboard', element: <DashboardPage /> },
        { path: '/customers', element: <CustomersPage /> },
        { path: '/customers/:customerId', element: <CustomerDetailPage /> },
        { path: '/equipment', element: <EquipmentPage /> },
        { path: '/equipment/:equipmentId', element: <EquipmentDetailPage /> },
        { path: '/sales', element: <SalesPage /> },
        { path: '/sales/new', element: <NewSalePage /> },
        { path: '/sales/:saleId', element: <SaleDetailPage /> },
        { path: '*', element: <Navigate to="/dashboard" replace /> },
      ],
    }],
  },
])

