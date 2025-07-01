/**
 * Authentication Context
 * Manages user authentication state and provides auth functions
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { authService } from '../services/authService'
import toast from 'react-hot-toast'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for existing token on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem(import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token')
        
        if (token) {
          // Verify token validity
          const userData = await authService.getProfile()
          setUser(userData.data.user)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        // Clear invalid token
        localStorage.removeItem(import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token')
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  // Login function
  const login = async (email, password) => {
    try {
      setLoading(true)
      const response = await authService.login(email, password)
      console.log("login response", response);
      
      if (response.data.data.token) {
        localStorage.setItem(
          import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token',
          response.data.data.token
        )
        setUser(response.data.data.user)
        toast.success('Login successful!')
        return { success: true }
      } else {
        throw new Error('No token received')
      }
    } catch (error) {
      const message = error.response?.data?.data.message || 'Login failed'
      toast.error(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }

  // Register function
  const register = async (userData) => {
    try {
      setLoading(true)
      const response = await authService.register(userData)
      
      if (response.data.data.token) {
        localStorage.setItem(
          import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token',
          response.data.token
        )
        setUser(response.data.data.user)
        toast.success('Registration successful!')
        return { success: true }
      } else {
        throw new Error('No token received')
      }
    } catch (error) {
      const message = error.response?.data?.data.message || 'Registration failed'
      toast.error(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }

  // Logout function
  const logout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem(import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token')
      setUser(null)
      toast.success('Logged out successfully')
    }
  }

  // Update profile function
  const updateProfile = async (profileData) => {
    try {
      const response = await authService.updateProfile(profileData)
      setUser(response.data.data.user) //fixed
      toast.success('Profile updated successfully!')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.data.message || 'Profile update failed'
      toast.error(message)
      return { success: false, message }
    }
  }

  // Check if user has required role
  const hasRole = (requiredRole) => {
    if (!user) return false
    if (Array.isArray(requiredRole)) {
      return requiredRole.includes(user.role)
    }
    return user.role === requiredRole
  }

  // Check if user is admin
  const isAdmin = () => hasRole('admin')

  // Check if user is trader
  const isTrader = () => hasRole('trader')

  // Check if user is customer
  const isCustomer = () => hasRole('customer')

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    hasRole,
    isAdmin,
    isTrader,
    isCustomer
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}