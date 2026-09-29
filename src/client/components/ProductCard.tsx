import React, { useState } from 'react';
import { Product } from '../../core/types.ts';
import { triggerHaptic } from '../telegram.ts';
import { ShoppingBag } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect }) => {
  const [imageError, setImageError] = useState(false);
  const mainImage = product.images?.[0];
  const isOutOfStock = (product.totalStock ?? 0) <= 0;

  return (
    <article
      onClick={() => {
        triggerHaptic('light');
        onSelect(product);
      }}
      className="group flex flex-col bg-white rounded-2xl border border-neutral-200/80 overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer text-left"
    >
      {/* Product Image Container */}
      <div className="relative aspect-square w-full bg-neutral-100 overflow-hidden">
        {mainImage && !imageError ? (
          <img
            src={mainImage}
            alt={product.name}
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover object-center group-hover:scale-104 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400 p-4 text-center">
            <ShoppingBag className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-xs font-serif italic text-neutral-500 line-clamp-2">{product.name}</span>
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center">
            <span className="text-xs font-semibold tracking-wider uppercase text-neutral-800 bg-neutral-100/90 px-3 py-1.5 rounded-lg border border-neutral-300">
              Нет в наличии
            </span>
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium text-neutral-500 tracking-wide uppercase">
            {product.categoryName || 'Одежда'}
            {product.variants && product.variants.length > 0 && (
              <>
                <span className="mx-1" aria-hidden="true">·</span>
                <span>{product.variants.length} {product.variants.length === 1 ? 'размер' : 'размера'}</span>
              </>
            )}
          </div>
          <h3 className="text-sm font-semibold text-neutral-900 line-clamp-1 mt-0.5 group-hover:text-neutral-700 transition-colors">
            {product.name}
          </h3>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
          <div className="text-base font-bold text-neutral-900 tabular-nums">
            {product.price.toLocaleString('ru-RU')} ₽
          </div>

          <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-900 transition-colors">
            {isOutOfStock ? 'Подробнее' : 'Выбрать →'}
          </span>
        </div>
      </div>
    </article>
  );
};
