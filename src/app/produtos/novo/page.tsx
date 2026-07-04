import type { Metadata } from 'next'
import ProductForm from '../ProductForm'

export const metadata: Metadata = { title: 'Novo Produto' }

export default function NovoProdutoPage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Novo Produto</h1>
          <p className="page-subtitle">Cadastre um item no catálogo conectado ao estoque atual</p>
        </div>
      </div>

      <div className="page-content">
        <ProductForm />
      </div>
    </div>
  )
}
