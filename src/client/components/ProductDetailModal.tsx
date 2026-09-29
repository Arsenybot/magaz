import React, { useState, useEffect } from 'react';
import { Product, ProductVariant } from '../../core/types.ts';
import { triggerHaptic, triggerHapticSuccess } from '../telegram.ts';
import { X, Minus, Plus, ShoppingBag, Check } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, variant: ProductVariant, quantity: number) => Promise<void>;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
}) => {
  if (!product) return null;

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [imageError, setImageError] = useState(false);

  const variants = product.variants || [];

  // Default to first variant with available stock, or first variant
  useEffect(() => {
    if (variants.length > 0) {
      const firstInStock = variants.find((v) => v.stockQuantity > 0) || variants[0];
      setSelectedVariant(firstInStock);
    }
    setQuantity(1);
    setAddedSuccess(false);
  }, [product]);

  const currentStock = selectedVariant ? selectedVariant.stockQuantity : 0;
  const isAvailable = currentStock > 0;
  const unitPrice = selectedVariant?.priceOverride ?? product.price;
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = async () => {
    if (!selectedVariant || !isAvailable || isAdding) return;

    setIsAdding(true);
    try {
      await onAddToCart(product, selectedVariant, quantity);
      triggerHapticSuccess();
      setAddedSuccess(true);
      setTimeout(() => {
        setAddedSuccess(false);
        onClose();
      }, 700);
    } catch (err: any) {
      alert(err.message || 'Ошибка добавления в корзину');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      {/* Modal / Bottom Sheet */}
      <div
        className="w-full max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-neutral-200/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar with close button */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-neutral-100 shrink-0">
          <div className="w-10 h-1 bg-neutral-300 rounded-full mx-auto sm:hidden absolute left-1/2 -translate-x-1/2 top-2" />
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
            {product.categoryName || 'Товар'}
          </span>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Закрыть"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Main Product Image */}
          <div className="relative aspect-square w-full rounded-2xl bg-neutral-100 overflow-hidden">
            {product.images?.[0] && !imageError ? (
              <img
                src={product.images[0]}
                alt={product.name}
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400">
                <ShoppingBag className="w-12 h-12 mb-2 opacity-50" />
                <span className="text-sm font-serif italic">{product.name}</span>
              </div>
            )}
          </div>

          {/* Title & Price */}
          <div>
            <h2 className="text-xl font-bold text-neutral-900 tracking-tight">{product.name}</h2>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-neutral-900 tabular-nums">
                {unitPrice.toLocaleString('ru-RU')} ₽
              </span>
              <span className="text-xs text-neutral-500">с НДС</span>
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-sm text-neutral-600 leading-relaxed font-sans">{product.description}</p>
          )}

          {/* Size Variant Picker */}
          {variants.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-900 uppercase tracking-wider">Размер</span>
                <span className="text-neutral-500">
                  {selectedVariant ? (
                    selectedVariant.stockQuantity > 0 ? (
                      <span className="text-emerald-700">В наличии: {selectedVariant.stockQuantity} шт.</span>
                    ) : (
                      <span className="text-rose-600">Нет в наличии</span>
                    )
                  ) : null}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  const inStock = v.stockQuantity > 0;

                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={!inStock}
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedVariant(v);
                        if (quantity > v.stockQuantity) {
                          setQuantity(Math.max(1, v.stockQuantity));
                        }
                      }}
                      className={`min-h-[44px] min-w-[56px] px-3.5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? 'bg-neutral-950 text-white shadow-xs'
                          : inStock
                          ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-200/80'
                          : 'bg-neutral-50 text-neutral-300 border border-neutral-200/40 line-through cursor-not-allowed'
                      }`}
                    >
                      <span>{v.size}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Stepper */}
          {isAvailable && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">Количество</span>
              <div className="flex items-center border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50">
                <button
                  type="button"
                  aria-label="Уменьшить количество"
                  disabled={quantity <= 1}
                  onClick={() => {
                    triggerHaptic('light');
                    setQuantity((prev) => Math.max(1, prev - 1));
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-bold text-sm text-neutral-900 tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Увеличить количество"
                  disabled={quantity >= currentStock}
                  onClick={() => {
                    triggerHaptic('light');
                    setQuantity((prev) => Math.min(currentStock, prev + 1));
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="p-4 border-t border-neutral-100 bg-white/95 shrink-0">
          <button
            type="button"
            disabled={!isAvailable || isAdding || addedSuccess}
            onClick={handleAddToCart}
            className={`w-full min-h-[50px] px-6 py-3 rounded-2xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
              addedSuccess
                ? 'bg-emerald-600 text-white'
                : isAvailable
                ? 'bg-neutral-950 text-white hover:bg-neutral-800 active:scale-[0.99] shadow-md'
                : 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
            }`}
          >
            {addedSuccess ? (
              <>
                <Check className="w-5 h-5 animate-in zoom-in" />
                <span>Добавлено в корзину!</span>
              </>
            ) : isAvailable ? (
              <>
                <ShoppingBag className="w-4 h-4" />
                <span>Добавить за {totalPrice.toLocaleString('ru-RU')} ₽</span>
              </>
            ) : (
              <span>Товара нет на складе</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
