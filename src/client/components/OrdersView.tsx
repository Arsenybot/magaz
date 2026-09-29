import React, { useState, useEffect } from 'react';
import { Order, OrderStatus } from '../../core/types.ts';
import { api } from '../api.ts';
import { triggerHaptic } from '../telegram.ts';
import { Package, Clock, CheckCircle2, Truck, Check, AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';

interface OrdersViewProps {
  onBackToCatalog: () => void;
  onPayOrder?: (order: Order) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ onBackToCatalog, onPayOrder }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async () => {
    try {
      const data = await api.getOrders();
      setOrders(data);
      if (selectedOrder) {
        const fresh = data.find((o) => o.id === selectedOrder.id);
        if (fresh) setSelectedOrder(fresh);
      }
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'NEW':
      case 'PAYMENT_PENDING':
        return { label: 'Ожидает оплаты', color: 'bg-amber-100 text-amber-900 border-amber-200' };
      case 'PAID':
        return { label: 'Оплачен', color: 'bg-emerald-100 text-emerald-900 border-emerald-200' };
      case 'PROCESSING':
        return { label: 'Собирается', color: 'bg-blue-100 text-blue-900 border-blue-200' };
      case 'READY':
        return { label: 'Готов к выдаче', color: 'bg-purple-100 text-purple-900 border-purple-200' };
      case 'COMPLETED':
        return { label: 'Выполнен', color: 'bg-neutral-100 text-neutral-800 border-neutral-300' };
      case 'CANCELLED':
        return { label: 'Отменен', color: 'bg-rose-100 text-rose-900 border-rose-200' };
      case 'REFUNDED':
        return { label: 'Возврат средств', color: 'bg-neutral-100 text-neutral-600 border-neutral-200' };
      default:
        return { label: status, color: 'bg-neutral-100 text-neutral-700 border-neutral-200' };
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-neutral-400">
        <Package className="w-8 h-8 mx-auto animate-bounce opacity-40 mb-2" />
        <p className="text-xs">Загрузка заказов...</p>
      </div>
    );
  }

  // Detailed Order View
  if (selectedOrder) {
    const badge = getStatusBadge(selectedOrder.status);
    return (
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedOrder(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ко всем заказам</span>
          </button>

          <button
            onClick={() => {
              setRefreshing(true);
              fetchOrders();
            }}
            aria-label="Обновить"
            className="p-1.5 text-neutral-400 hover:text-neutral-900"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-xs space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs text-neutral-400 font-mono">
                {new Date(selectedOrder.createdAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <h2 className="text-xl font-bold text-neutral-900 mt-0.5">
                Заказ #{selectedOrder.orderNumber}
              </h2>
            </div>
            <span className={`px-3 py-1 rounded-xl text-xs font-semibold border ${badge.color}`}>
              {badge.label}
            </span>
          </div>

          {/* Delivery & Contact Info */}
          <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-100 text-xs space-y-1 text-neutral-600">
            <div><strong>Получатель:</strong> {selectedOrder.customerName} ({selectedOrder.customerPhone})</div>
            <div>
              <strong>Способ:</strong> {selectedOrder.deliveryMethod === 'DELIVERY' ? `Доставка курьером (${selectedOrder.deliveryAddress})` : 'Самовывоз из бутика'}
            </div>
            {selectedOrder.comment && <div><strong>Комментарий:</strong> {selectedOrder.comment}</div>}
          </div>

          {/* Items */}
          <div className="space-y-2 pt-2 border-t border-neutral-100">
            <span className="text-xs font-semibold text-neutral-900 uppercase tracking-wider block">Состав заказа</span>
            <div className="divide-y divide-neutral-100">
              {selectedOrder.items?.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-neutral-900">{item.productNameSnapshot}</div>
                    <div className="text-neutral-500">{item.variantNameSnapshot} · {item.quantity} шт.</div>
                  </div>
                  <div className="font-bold text-neutral-900 tabular-nums">
                    {item.totalPrice.toLocaleString('ru-RU')} ₽
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="pt-3 border-t border-neutral-100 space-y-1 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Товары</span>
              <span className="tabular-nums font-medium">{selectedOrder.subtotal.toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Доставка</span>
              <span className="tabular-nums font-medium">
                {selectedOrder.deliveryPrice === 0 ? 'Бесплатно' : `${selectedOrder.deliveryPrice.toLocaleString('ru-RU')} ₽`}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold text-neutral-950 pt-2 border-t border-neutral-100">
              <span>Итого</span>
              <span className="tabular-nums text-base">{selectedOrder.total.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>

          {/* Action if unpaid */}
          {(selectedOrder.status === 'NEW' || selectedOrder.status === 'PAYMENT_PENDING') && onPayOrder && (
            <button
              onClick={() => onPayOrder(selectedOrder)}
              className="w-full mt-2 min-h-[46px] px-4 py-2.5 bg-neutral-950 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              Оплатить заказ ({selectedOrder.total.toLocaleString('ru-RU')} ₽)
            </button>
          )}
        </div>
      </div>
    );
  }

  // Orders List
  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-neutral-900">Мои заказы</h1>
        <button
          onClick={() => {
            setRefreshing(true);
            fetchOrders();
          }}
          aria-label="Обновить"
          className="p-1.5 text-neutral-400 hover:text-neutral-900"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-neutral-200 p-6">
          <Package className="w-12 h-12 mx-auto stroke-[1.5] text-neutral-300 mb-3" />
          <p className="text-sm font-semibold text-neutral-800">У вас пока нет заказов</p>
          <p className="text-xs text-neutral-500 mt-1">Оформите свой первый заказ в каталоге магазина.</p>
          <button
            onClick={onBackToCatalog}
            className="mt-4 px-5 py-2.5 bg-neutral-950 text-white text-xs font-bold rounded-xl"
          >
            Перейти в каталог
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const badge = getStatusBadge(order.status);
            return (
              <div
                key={order.id}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedOrder(order);
                }}
                className="bg-white rounded-2xl p-4 border border-neutral-200/80 hover:border-neutral-400 hover:shadow-xs transition-all cursor-pointer text-left space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-neutral-900">
                    Заказ #{order.orderNumber}
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    {new Date(order.createdAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {' · '}
                    {order.deliveryMethod === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}
                  </span>
                  <span className="font-bold text-neutral-900 tabular-nums text-sm">
                    {order.total.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
