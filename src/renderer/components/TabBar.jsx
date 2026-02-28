import React from 'react'

export default function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <button
          key={tab}
          className={tab === active ? 'active' : ''}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
