import { createClient } from '@/lib/supabase/server'
import { Plus, Package } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Produtos' }

const categoryLabels: Record<string, string> = {
  notebooks: 'Notebooks',
  pcs_gamer: 'PCs Gamer',
  placas_video: 'Placas de Vídeo',
  monitores: 'Monitores',
  perifericos: 'Periféricos',
  assistencia: 'Assistência',
  licencas: 'Licenças',
  impressoras: 'Impressoras',
  outros: 'Outros',
}

export default async function ProdutosPage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('name')

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Produtos</h1>
          <p className="page-subtitle">Catálogo de produtos e controle de estoque</p>
        </div>
        <Link href="/produtos/novo" className="btn-primary">
          <Plus size={15} /> Novo Produto
        </Link>
      </div>

      <div className="page-content">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Custo</th>
                <th>Venda</th>
                <th>Margem</th>
                <th>Estoque</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products && products.length > 0 ? products.map((product: any) => {
                const margin = product.cost_price && product.sale_price
                  ? Math.round((product.sale_price - product.cost_price) / product.sale_price * 100)
                  : null
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(59,130,246,0.12)' }}>
                          <Package size={16} style={{ color: '#3b82f6' }} />
                        </div>
                        <div>
                          <p className="font-medium text-white">{product.name}</p>
                          {product.description && (
                            <p className="text-xs line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                              {product.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-blue">{categoryLabels[product.category] || product.category}</span>
                    </td>
                    <td>
                      <span className="text-sm">
                        {product.cost_price ? `R$ ${product.cost_price.toFixed(2)}` : '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-white">
                        {product.sale_price ? `R$ ${product.sale_price.toFixed(2)}` : '—'}
                      </span>
                    </td>
                    <td>
                      {margin !== null ? (
                        <span className={`badge ${margin >= 30 ? 'badge-green' : margin >= 15 ? 'badge-yellow' : 'badge-red'}`}>
                          {margin}%
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <span className={`text-sm font-semibold ${
                        product.stock_quantity === 0 ? 'text-red-400' :
                        product.stock_quantity < 5 ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {product.stock_quantity}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${product.status === 'ativo' ? 'badge-green' : 'badge-gray'}`}>
                        {product.status}
                      </span>
                    </td>
                    <td>
                      <Link href={`/produtos/${product.id}`} className="btn-ghost btn-sm">Editar</Link>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={8}>
                    <div className="text-center py-12">
                      <Package size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum produto cadastrado</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
