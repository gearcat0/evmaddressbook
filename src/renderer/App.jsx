import React, { useState } from 'react'
import TabBar from './components/TabBar'
import StatusBar from './components/StatusBar'
import AddressesScreen from './components/addresses/AddressesScreen'
import ChainsScreen from './components/chains/ChainsScreen'
import SettingsScreen from './components/settings/SettingsScreen'

const TABS = ['Addresses', 'Chains', 'Settings']

export default function App() {
  const [activeTab, setActiveTab] = useState('Addresses')

  return (
    <div className="app">
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      <div className="app-content">
        {activeTab === 'Addresses' && <AddressesScreen />}
        {activeTab === 'Chains' && <ChainsScreen />}
        {activeTab === 'Settings' && <SettingsScreen />}
      </div>
      <StatusBar />
    </div>
  )
}
