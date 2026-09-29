import React, { useState } from 'react';
import { Cart, DeliveryMethod, User } from '../../core/types.ts';
import { triggerHaptic } from '../telegram.ts';
import { X, Truck, Store, ArrowRight, ShieldCheck } from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  cart: Cart | null;
  currentUser: User | null;
  deliveryPrice: number;
  freeDeliveryThreshold: number;
  onClose: () => void;
  onSubmitOrder: (data: {
    customerName: string;
    customerPhone: string;
    customerUsername: string;
    deliveryMethod: DeliveryMethod;
    deliveryAddress?: string;
    comment?: string;
    paymentProvider: string;
  }) => Promise<void>;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  cart,
  currentUser,
  deliveryPrice,
  freeDeliveryThreshold,
  onClose,
  onSubmitOrder,
}) => {
  if (!isOpen) return null;

  const [customerName, setCustomerName] = useState(
    currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'Александр' : 'Александр'
  );
  const [customerPhone, setCustomerPhone] = useState('+7 (999) 123-45-67');
  const [customerUsername, setCustomerUsername] = useState(currentUser?.username || 'alex_buyer');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('DELIVERY');
  const [deliveryAddress, setDeliveryAddress] = useState('г. Москва, ул. Арбат, д. 24, кв. 18');
  const [comment, setComment] = useState('');
  const [paymentProvider, setPaymentProvider] = useState('mock');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = cart?.subtotal || 0;
  const calculatedDelivery = deliveryMethod === 'DELIVERY' ? (subtotal >= freeDeliveryThreshold ? 0 : deliveryPrice) : 0;
  const total = subtotal + calculatedDelivery;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) {
      setError('Пожалуйста, укажите ваше имя');
      return;
    }
    if (!customerPhone.trim()) {
      setError('Пожалуйста, укажите контактный телефон');
      return;
    }
    if (deliveryMethod === 'DELIVERY' && !deliveryAddress.trim()) {
      setError('Пожалуйста, укажите адрес доставки');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerUsername: customerUsername.trim(),
        deliveryMethod,
        deliveryAddress: deliveryMethod === 'DELIVERY' ? deliveryAddress.trim() : undefined,
        comment: comment.trim() || undefined,
        paymentProvider,
      });
    } catch (err: any) {
      setError(err.message || 'Ошибка при создании заказа');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 shrink-0">
          <h2 className="text-base font-bold text-neutral-900">Оформление заказа</h2>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Delivery Method Segmented Control */}
          <div>
            <label className="block text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">
              Способ получения
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-100 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDeliveryMethod('DELIVERY');
                }}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  deliveryMethod === 'DELIVERY'
                    ? 'bg-white text-neutral-950 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-950'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>Курьер</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDeliveryMethod('PICKUP');
                }}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  deliveryMethod === 'PICKUP'
                    ? 'bg-white text-neutral-950 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-950'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Самовывоз</span>
              </button>
            </div>
          </div>

          {/* Contact Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Имя и фамилия *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Иван Иванов"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Телефон *</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+7 (999) 000-00-00"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Telegram username (для связи)</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-neutral-400 text-sm">@</span>
                <input
                  type="text"
                  value={customerUsername}
                  onChange={(e) => setCustomerUsername(e.target.value.replace('@', ''))}
                  placeholder="username"
                  className="w-full min-h-[44px] pl-8 pr-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            {deliveryMethod === 'DELIVERY' ? (
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Адрес доставки *</label>
                <input
                  type="text"
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Город, улица, дом, квартира"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            ) : (
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600">
                <span className="font-semibold text-neutral-900 block mb-0.5">Адрес самовывоза:</span>
                ул. Большая Конюшенная, 12, бутик ATELIER. Ежедневно 10:00 – 22:00.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Комментарий к заказу</label>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Код домофона, пожелания к упаковке..."
                className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">
              Способ оплаты
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 hover:border-neutral-400 cursor-pointer transition-colors bg-white">
                <input
                  type="radio"
                  name="paymentProvider"
                  value="mock"
                  checked={paymentProvider === 'mock'}
                  onChange={() => setPaymentProvider('mock')}
                  className="w-4 h-4 text-neutral-900 accent-neutral-900"
                />
                <div className="flex-1">
                  <div className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                    <span>Тестовый шлюз (Mock Sandbox)</span>
                    <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono font-medium">TEST</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">Симуляция оплаты, проверка вебхуков и идемпотентности</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 hover:border-neutral-400 cursor-pointer transition-colors bg-white">
                <input
                  type="radio"
                  name="paymentProvider"
                  value="yookassa"
                  checked={paymentProvider === 'yookassa'}
                  onChange={() => setPaymentProvider('yookassa')}
                  className="w-4 h-4 text-neutral-900 accent-neutral-900"
                />
                <div className="flex-1">
                  <div className="text-xs font-semibold text-neutral-900">Банковская карта / СБП (ЮKassa)</div>
                  <div className="text-[11px] text-neutral-500">Оплата через сертифицированный шлюз РФ</div>
                </div>
              </label>
            </div>
          </div>

          {/* Pricing Breakdown */}
          <div className="pt-3 border-t border-neutral-100 space-y-1.5 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Стоимость товаров</span>
              <span className="font-semibold text-neutral-900 tabular-nums">{subtotal.toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Доставка</span>
              <span className="font-semibold text-neutral-900 tabular-nums">
                {calculatedDelivery === 0 ? 'Бесплатно' : `${calculatedDelivery.toLocaleString('ru-RU')} ₽`}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold text-neutral-950 pt-2 border-t border-neutral-100">
              <span>Итого к оплате</span>
              <span className="text-base tabular-nums">{total.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>

          {/* Action button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[50px] px-6 py-3 bg-neutral-950 text-white rounded-2xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Создание заказа...' : `Подтвердить и оплатить ${total.toLocaleString('ru-RU')} ₽`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
