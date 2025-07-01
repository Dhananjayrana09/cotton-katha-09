/**
 * Contract Search page - Flow 3
 * Search procurement by indent number for contract upload
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Search,
  FileText,
  ClipboardList,
  ArrowRight,
  AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'

const ContractSearch = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [indentNumber, setIndentNumber] = useState('')
  const [procurement, setProcurement] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // Search for procurement by indent number
  const searchProcurement = async (e) => {
    e.preventDefault()
    
    if (!indentNumber.trim()) {
      toast.error('Please enter an indent number')
      return
    }

    try {
      setLoading(true)
      setProcurement(null)
      setSearched(false)
      
      const response = await api.get('/contract/search', {
        params: { indent_number: indentNumber.trim() }
      })
      
      setProcurement(response.data.data.procurement)
      setSearched(true)
      
      if (response.data.data.procurement) {
        toast.success('Procurement details found')
      }
    } catch (error) {
      console.error('Error searching procurement:', error)
      setSearched(true)
      
      if (error.response?.status === 404) {
        toast.error('No procurement found for this indent number')
      } else {
        toast.error(error.response?.data?.message || 'Failed to search procurement')
      }
    } finally {
      setLoading(false)
    }
  }

  // Navigate to contract upload
  const proceedToUpload = () => {
    navigate('/contract/upload', {
      state: {
        procurement,
        indentNumber
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Contract Upload</h1>
        <p className="mt-1 text-sm text-gray-600">
          Search for procurement details and upload purchase contract
        </p>
      </div>

      {/* Search Form */}
      <div className="card p-6">
        <div className="flex items-center mb-6">
          <Search className="h-6 w-6 text-blue-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Search Procurement</h2>
        </div>

        <form onSubmit={searchProcurement} className="space-y-4">
          <div>
            <label htmlFor="indent" className="block text-sm font-medium text-gray-700 mb-2">
              Indent Number *
            </label>
            <div className="flex space-x-4">
              <input
                type="text"
                id="indent"
                value={indentNumber}
                onChange={(e) => setIndentNumber(e.target.value.toUpperCase())}
                placeholder="Enter indent number (e.g., IND001)"
                className="flex-1 input-field"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !indentNumber.trim()}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Enter the exact indent number from your procurement confirmation
            </p>
          </div>
        </form>
      </div>

      {/* Search Results */}
      {searched && (
        <div className="card p-6">
          {procurement ? (
            <>
              {/* Procurement Found */}
              <div className="flex items-center mb-6">
                <ClipboardList className="h-6 w-6 text-green-500 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Procurement Details Found</h2>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <ClipboardList className="h-5 w-5 text-green-500 mr-2" />
                  <p className="text-green-800 font-medium">
                    Procurement record found for indent {indentNumber}
                  </p>
                </div>
              </div>

              {/* Procurement Information */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-900 border-b pb-2">
                    Basic Information
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Indent Number</label>
                      <p className="text-lg font-medium text-gray-900">{procurement.indent_number}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Firm Name</label>
                      <p className="text-lg text-gray-900">{procurement.firm_name}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Bale Quantity</label>
                      <p className="text-lg text-gray-900">{procurement.bale_quantity?.toLocaleString()} bales</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Zone</label>
                      <p className="text-lg text-gray-900">{procurement.zone}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Transaction Type</label>
                    <p className="text-lg text-gray-900">{procurement.transaction_type}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-900 border-b pb-2">
                    Financial Details
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Cotton Value</label>
                      <p className="text-lg text-gray-900">₹{procurement.cotton_value?.toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500">EMD Amount</label>
                      <p className="text-lg text-gray-900">₹{procurement.emd_amount?.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500">GST Amount</label>
                      <p className="text-lg text-gray-900">₹{procurement.gst_amount?.toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Total Amount</label>
                      <p className="text-xl font-bold text-green-600">₹{procurement.total_amount?.toLocaleString()}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Due Date</label>
                    <p className="text-lg text-gray-900">{new Date(procurement.due_date).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Branch Information */}
              {procurement.allocation?.branch_information && (
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Branch Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-500">Branch Name:</span>
                      <p className="text-gray-900">{procurement.allocation.branch_information.branch_name}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Branch Code:</span>
                      <p className="text-gray-900">{procurement.allocation.branch_information.branch_code}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Email:</span>
                      <p className="text-gray-900">{procurement.allocation.branch_information.branch_email_id}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-end">
                <button
                  onClick={proceedToUpload}
                  className="btn-primary"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Proceed to Upload Contract
                  <ArrowRight className="h-4 w-4 ml-2" />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Procurement Not Found */}
              <div className="flex items-center mb-6">
                <AlertTriangle className="h-6 w-6 text-red-500 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">No Procurement Found</h2>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                  <p className="text-red-800">
                    No procurement record found for indent number: <strong>{indentNumber}</strong>
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="text-md font-medium text-yellow-900 mb-2">Possible Reasons:</h3>
                <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
                  <li>Indent number may be incorrect or misspelled</li>
                  <li>Procurement calculation may not have been completed yet</li>
                  <li>This indent may not exist in the system</li>
                  <li>EMD payment may not have been processed</li>
                </ul>
                
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-yellow-900">Next Steps:</p>
                  <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
                    <li>Verify the indent number from your purchase confirmation email</li>
                    <li>Ensure procurement calculation has been completed</li>
                    <li>Check if EMD payment has been processed</li>
                    <li>Contact admin if the issue persists</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <FileText className="h-6 w-6 text-purple-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Contract Upload Process</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="bg-blue-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-blue-600 font-bold">1</span>
            </div>
            <h3 className="font-medium text-gray-900">Search</h3>
            <p className="text-sm text-gray-500">Enter indent number to find procurement details</p>
          </div>

          <div className="text-center">
            <div className="bg-green-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-green-600 font-bold">2</span>
            </div>
            <h3 className="font-medium text-gray-900">Upload</h3>
            <p className="text-sm text-gray-500">Upload PDF contract file with proper naming</p>
          </div>

          <div className="text-center">
            <div className="bg-yellow-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-yellow-600 font-bold">3</span>
            </div>
            <h3 className="font-medium text-gray-900">Review</h3>
            <p className="text-sm text-gray-500">Admin reviews and approves the contract</p>
          </div>

          <div className="text-center">
            <div className="bg-purple-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-purple-600 font-bold">4</span>
            </div>
            <h3 className="font-medium text-gray-900">Send</h3>
            <p className="text-sm text-gray-500">Contract is emailed to relevant branch</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ContractSearch