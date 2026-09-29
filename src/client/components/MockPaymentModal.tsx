import React, { useState } from 'react';
import { Order } from '../../core/types.ts';
import { api } from '../api.ts';
import { triggerHaptic, triggerHapticSuccess } from '../telegram.ts';
import { AlertTriangle, CheckCircle2, XCircle, RefreshCw, X, ShieldAlert } from 'lucide-react';

interface MockPaymentModalProps {
  order: Order | null;
  providerPaymentId?: string;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export const MockPaymentModal: React.FC<MockPaymentModalProps> = ({
  order,
  providerPaymentId,
  onClose,
  onPaymentSuccess,
}) => {
  if (!order) return null;

  const [isLoading, setIsLoading] = useState(false);
  const [logMessage, setLogMessage] = useState<string | null>(null);

  const handleSimulate = async (status: 'PAID' | 'FAILED', isDuplicate = false) => {
    setIsLoading(true);
    setLogMessage(null);

    try {
      const res = await api.simulateMockPayment({
        orderId: order.id,
        providerPaymentId,
        status,
        amount: order.total,
        isDuplicate,
      });

      if (isDuplicate) {
        setLogMessage(`ℹ️ Идемпотентный ответ: событие было проигнорировано сервером (isDuplicate: true). Повторного списания или смены статуса не произошло.`);
        triggerHaptic('medium');
      } else if (status === 'PAID') {
        triggerHapticSuccess();
        setLogMessage('✅ Оплата подтверждена сервером. Заказ переведен в статус PAID.');
        setTimeout(() => {
          onPaymentSuccess();
        }, 1200);
      } else {
        triggerHaptic('heavy');
        setLogMessage('❌ Платеж отклонен провайдером. Заказ остался в статусе FAILED / PAYMENT_PENDING.');
      }
    } catch (err: any) {
      setLogMessage(`Ошибка симуляции: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-amber-400"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner: TEST PAYMENT (Requirement 27) */}
        <div className="bg-amber-400 text-amber-950 px-5 py-3 font-bold text-xs uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>TEST PAYMENT · ТЕСТОВЫЙ ПЛАТЕЖ</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="p-1 rounded-full hover:bg-amber-500/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details */}
        <div className="p-5 space-y-4">
          <div className="text-center py-2">
            <div className="text-xs text-neutral-500">Сумма к списанию</div>
            <div className="text-3xl font-bold text-neutral-900 tabular-nums mt-0.5">
              {order.total.toLocaleString('ru-RU')} ₽
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              Заказ <strong className="text-neutral-800">#{order.orderNumber}</strong> · {order.customerName}
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs text-neutral-600 space-y-1">
            <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Режим тестирования шлюза:</span>
            </div>
            <p>
              Вы находитесь в песочнице MockPaymentProvider. Выберите сценарий для отправки вебхука на сервер и проверки реакции приложения.
            </p>
          </div>

          {logMessage && (
            <div className="p-3 bg-neutral-900 text-neutral-100 rounded-xl font-mono text-xs leading-relaxed">
              {logMessage}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => handleSimulate('PAID')}
              disabled={isLoading}
              className="w-full min-h-[46px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Имитировать успешную оплату (200 OK)</span>
            </button>

            <button
              onClick={() => handleSimulate('FAILED')}
              disabled={isLoading}
              className="w-full min-h-[46px] px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              <span>Имитировать отказ / ошибку шлюза</span>
            </button>

            <button
              onClick={() => handleSimulate('PAID', true)}
              disabled={isLoading}
              className="w-full min-h-[46px] px-4 py-2.5 bg-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Имитировать дублирующий Webhook (Идемпотентность)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
