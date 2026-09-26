import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { RequireAuth, RequireGuest, RequireManager } from './guards'

const Login = lazy(() => import('@/pages/auth/Login'))
const Register = lazy(() => import('@/pages/auth/Register'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const VerifyOtp = lazy(() => import('@/pages/auth/VerifyOtp'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ProductsList = lazy(() => import('@/pages/products/ProductsList'))
const ProductDetail = lazy(() => import('@/pages/products/ProductDetail'))
const ProductFormPage = lazy(() => import('@/pages/products/ProductFormPage'))
const OperationsList = lazy(() => import('@/pages/operations/OperationsList'))
const OperationPage = lazy(() => import('@/pages/operations/OperationPage'))
const MoveHistory = lazy(() => import('@/pages/MoveHistory'))
const Warehouses = lazy(() => import('@/pages/settings/Warehouses'))
const WarehouseDetail = lazy(() => import('@/pages/settings/WarehouseDetail'))
const Locations = lazy(() => import('@/pages/settings/Locations'))
const Team = lazy(() => import('@/pages/settings/Team'))
const Profile = lazy(() => import('@/pages/Profile'))
const NotFound = lazy(() => import('@/pages/NotFound'))

export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/verify-otp', element: <VerifyOtp /> },
      { path: '/reset-password', element: <ResetPassword /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'products', element: <ProductsList /> },
          { path: 'products/new', element: <ProductFormPage /> },
          { path: 'products/:id', element: <ProductDetail /> },
          { path: 'products/:id/edit', element: <ProductFormPage /> },
          { path: 'operations', element: <Navigate to="/operations/receipts" replace /> },
          { path: 'operations/:typeSlug', element: <OperationsList /> },
          { path: 'operations/:typeSlug/new', element: <OperationPage /> },
          { path: 'operations/:typeSlug/:id', element: <OperationPage /> },
          { path: 'history', element: <MoveHistory /> },
          { path: 'profile', element: <Profile /> },
          {
            path: 'settings',
            element: <RequireManager />,
            children: [
              { index: true, element: <Navigate to="/settings/warehouses" replace /> },
              { path: 'warehouses', element: <Warehouses /> },
              { path: 'warehouses/:id', element: <WarehouseDetail /> },
              { path: 'locations', element: <Locations /> },
              { path: 'team', element: <Team /> },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
