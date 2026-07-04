'use client'

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'

const messageData = [
  { day: 'Seg', enviadas: 120, entregues: 115, lidas: 89 },
  { day: 'Ter', enviadas: 200, entregues: 190, lidas: 145 },
  { day: 'Qua', enviadas: 150, entregues: 142, lidas: 110 },
  { day: 'Qui', enviadas: 280, entregues: 265, lidas: 198 },
  { day: 'Sex', enviadas: 320, entregues: 308, lidas: 245 },
  { day: 'Sáb', enviadas: 180, entregues: 172, lidas: 130 },
  { day: 'Dom', enviadas: 90, entregues: 85, lidas: 62 },
]

const stageData = [
  { name: 'Novo Lead', value: 45, color: '#3b82f6' },
  { name: 'Em Atendimento', value: 28, color: '#f59e0b' },
  { name: 'Orçamento', value: 18, color: '#a855f7' },
  { name: 'Negociação', value: 12, color: '#DC2626' },
  { name: 'Concluído', value: 35, color: '#22c55e' },
]

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg p-3 text-xs"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)' }}>
        <p className="font-semibold text-white mb-1">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function DashboardCharts() {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Messages chart */}
      <div className="card p-5 lg:col-span-2">
        <h3 className="font-semibold text-white text-sm mb-1">Mensagens — Últimos 7 dias</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Enviadas, entregues e lidas</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={messageData}>
            <defs>
              <linearGradient id="gradEnviadas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradEntregues" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradLidas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="enviadas" name="Enviadas" stroke="#DC2626" strokeWidth={2} fill="url(#gradEnviadas)" />
            <Area type="monotone" dataKey="entregues" name="Entregues" stroke="#22c55e" strokeWidth={2} fill="url(#gradEntregues)" />
            <Area type="monotone" dataKey="lidas" name="Lidas" stroke="#a855f7" strokeWidth={2} fill="url(#gradLidas)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Funnel chart */}
      <div className="card p-5">
        <h3 className="font-semibold text-white text-sm mb-1">Funil de Vendas</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Distribuição por etapa</p>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={stageData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value">
              {stageData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`${value} oportunidades`, '']}
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-hover)',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-1.5 mt-2">
          {stageData.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
              <span className="text-xs font-medium text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
