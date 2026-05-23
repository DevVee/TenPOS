import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, Banknote, Smartphone, Check, Tag, X, AlertCircle, Loader2 } from 'lucide-react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import { apiValidateVoucher } from '../../lib/api'
import type { Payment as PaymentType } from '../../types'

type PayMethod = 'cash' | 'gcash' | 'paymaya' | 'card'

const METHODS: { id: PayMethod; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'cash',    label: 'Cash',    icon: Banknote,    color: 'bg-green-50  border-green-200  text-green-700' },
  { id: 'gcash',   label: 'GCash',   icon: Smartphone,  color: 'bg-blue-50   border-blue-200   text-blue-700'  },
  { id: 'paymaya', label: 'PayMaya', icon: Smartphone,  color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { id: 'card',    label: 'Card',    icon: CreditCard,  color: 'bg-orange-50 border-orange-200 text-orange-700' },
]

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

const QUICK_CASH = [500, 1000, 1500, 2000, 3000, 5000]

export function Payment() {
  const navigate = useNavigate()
  const { cart, cartSubtotal } = usePOSStore()
  const { user } = useAuthStore()

  const subtotal  = cartSubtotal()
  const baseTotal = subtotal

  const [method, setMethod]       = useState<PayMethod>('cash')
  const [cashInput, setCashInput] = useState(String(Math.ceil(baseTotal / 100) * 100 || 0))
  const [refInput, setRefInput]   = useState('')
  const [voucherCode, setVoucherCode]   = useState('')
  const [voucherResult, setVoucherResult] = useState<{ valid: boolean; discount: number; message: string } | null>(null)
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  const voucherDiscount = voucherResult?.valid ? voucherResult.discount : 0
  const total           = Math.max(0, baseTotal - voucherDiscount)
  const cashReceived    = parseFloat(cashInput) || 0
  const change          = Math.max(0, cashReceived - total)
  const insufficient    = method === 'cash' && cashReceived < total && cashInput !== ''

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return
    setVoucherLoading(true)
    setVoucherResult(null)
    try {
      const result = await apiValidateVoucher(voucherCode.trim(), baseTotal)
      if (result.valid && result.discount_amount != null) {
        const desc = result.discount_type === 'percent' ? `${result.discount_value}% off` : `₱${result.discount_value} off`
        setVoucherResult({ valid: true, discount: result.discount_amount, message: `${desc} applied` })
      } else {
        setVoucherResult({ valid: false, discount: 0, message: result.error ?? 'Invalid voucher code.' })
      }
    } catch (err) {
      setVoucherResult({ valid: false, discount: 0, message: err instanceof Error ? err.message : 'Could not validate voucher.' })
    } finally {
      setVoucherLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (cart.length === 0) return
    if (method === 'cash' && cashReceived < total) return
    const branchId = user?.branch_id
    if (!branchId) {
      setCheckoutError('Your account has no branch assigned. Contact your administrator.')
      return
    }
    setProcessing(true)
    setCheckoutError('')
    try {
      const payments: PaymentType[] = [{
        method,
        amount: method === 'cash' ? cashReceived : total,
        reference: refInput.trim() || undefined,
      }]
      const result = await usePOSStore.getState().checkoutCart(
        branchId!, payments, 0,
        voucherResult?.valid ? voucherCode.trim() : undefined
      )
      navigate(`/pos/receipt/${result.id}`, {
        state: {
          transaction: {
            receiptNo:  result.receipt_no,
            offline:    result.offline,
            created_at: new Date().toISOString(),
            items: cart.map((i) => ({
              name: i.product.name,
              qty: i.quantity,
              price: i.product.price + (i.variant?.priceAdjustment ?? 0),
              discount: i.discount,
              total: (i.product.price + (i.variant?.priceAdjustment ?? 0)) * i.quantity - i.discount,
            })),
            subtotal: baseTotal,
            voucherDiscount,
            voucherCode: voucherResult?.valid ? voucherCode.trim() : undefined,
            total,
            paid: method === 'cash' ? cashReceived : total,
            change: method === 'cash' ? change : 0,
            method,
          },
        },
      })
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Payment failed. Please try again.')
      setProcessing(false)
    }
  }

  const needsRef   = method === 'gcash' || method === 'paymaya' || method === 'card'
  const canConfirm = cart.length > 0 && !processing
    && (method !== 'cash' || cashReceived >= total)
    && (!needsRef || refInput.trim().length > 0)

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/pos')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">Payment</h1>
            <p className="text-xs text-gray-400 mt-0.5">{cart.length} item{cart.length !== 1 ? 's' : ''} · {fmt(baseTotal)}</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 pb-8">
        {checkoutError && (
          <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-brand text-sm rounded-2xl px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{checkoutError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* ── LEFT: Order summary + Voucher ──────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Order summary */}
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Order Summary</p>
              <div className="space-y-2 max-h-56 overflow-y-auto mb-3">
                {cart.map((item) => {
                  const unitPrice = item.product.price + (item.variant?.priceAdjustment ?? 0)
                  return (
                    <div key={`${item.product.id}_${item.variant?.id ?? 'base'}`} className="flex items-center gap-2.5">
                      {item.product.imageUrl ? (
                        <img src={item.product.imageUrl} alt={item.product.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{item.product.name}</p>
                        <p className="text-[10px] text-gray-400">{fmt(unitPrice)} × {item.quantity}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-800 flex-shrink-0">
                        {fmt(unitPrice * item.quantity - item.discount)}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span>
                  <span>{fmt(baseTotal)}</span>
                </div>
                {voucherDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600 font-medium">
                    <span>Voucher ({voucherCode})</span>
                    <span>-{fmt(voucherDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="text-2xl font-black text-brand">{fmt(total)}</span>
                </div>
              </div>
            </div>

            {/* Voucher */}
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Promo / Voucher</p>
              {voucherResult?.valid ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-sm font-bold text-green-700">{voucherCode.toUpperCase()}</p>
                      <p className="text-xs text-green-600">{voucherResult.message}</p>
                    </div>
                  </div>
                  <button onClick={() => { setVoucherCode(''); setVoucherResult(null) }} className="p-1 text-green-500 hover:text-green-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      className="input-base flex-1 uppercase text-sm font-bold tracking-wider"
                      placeholder="Enter promo code…"
                      value={voucherCode}
                      onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherResult(null) }}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyVoucher()}
                    />
                    <button
                      onClick={handleApplyVoucher}
                      disabled={voucherLoading || !voucherCode.trim()}
                      className="btn-secondary px-4 disabled:opacity-50 text-sm font-bold"
                    >
                      {voucherLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                    </button>
                  </div>
                  {voucherResult && !voucherResult.valid && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-brand font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> {voucherResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Payment ─────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4">
            {/* Method selector */}
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Payment Method</p>
              <div className="grid grid-cols-4 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border-2 transition-all ${
                      method === m.id
                        ? `${m.color} border-2 shadow-md`
                        : 'border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200'
                    }`}
                  >
                    <m.icon className={`w-6 h-6 ${method === m.id ? '' : 'text-gray-400'}`} />
                    <span className={`text-xs font-bold ${method === m.id ? '' : 'text-gray-500'}`}>{m.label}</span>
                    {method === m.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash numpad */}
            {method === 'cash' && (
              <div className="card p-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Cash Received</p>

                {/* Cash input */}
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg font-bold">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={`input-base pl-8 text-2xl font-black text-center py-4 ${insufficient ? 'border-red-300 bg-red-50' : ''}`}
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                  />
                </div>

                {/* Quick amounts */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {QUICK_CASH.map((v) => (
                    <button
                      key={v}
                      onClick={() => setCashInput(String(v))}
                      className="px-4 py-2.5 rounded-xl bg-gray-100 text-sm font-bold text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                      ₱{v.toLocaleString()}
                    </button>
                  ))}
                  <button
                    onClick={() => setCashInput(String(Math.ceil(total)))}
                    className="px-4 py-2.5 rounded-xl bg-brand-pale text-sm font-bold text-brand hover:bg-red-100 transition-colors"
                  >
                    Exact
                  </button>
                </div>

                {/* Change display */}
                {cashReceived > 0 && (
                  <div className={`mt-4 rounded-2xl px-4 py-3 flex items-center justify-between ${
                    cashReceived >= total ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
                  }`}>
                    <div>
                      <p className={`text-xs font-semibold ${cashReceived >= total ? 'text-green-600' : 'text-yellow-600'}`}>
                        {cashReceived >= total ? 'Change to return' : 'Still needed'}
                      </p>
                      <p className={`text-2xl font-black ${cashReceived >= total ? 'text-green-700' : 'text-yellow-700'}`}>
                        {cashReceived >= total ? fmt(change) : fmt(total - cashReceived)}
                      </p>
                    </div>
                    {cashReceived >= total && (
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Digital payment reference */}
            {(method === 'gcash' || method === 'paymaya') && (
              <div className="card p-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Reference Number</p>
                <input
                  type="text"
                  className="input-base text-lg font-bold text-center tracking-widest"
                  placeholder="Enter reference number"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                />
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-600">
                  Ask customer to show the payment confirmation screen. Enter the reference number shown.
                </div>
                <div className="mt-4 bg-gray-50 rounded-2xl px-4 py-3 flex items-center justify-between border border-gray-200">
                  <p className="text-sm text-gray-600 font-medium">Amount to collect</p>
                  <p className="text-2xl font-black text-brand">{fmt(total)}</p>
                </div>
              </div>
            )}

            {/* Card payment */}
            {method === 'card' && (
              <div className="card p-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Card Payment</p>
                <input
                  type="text"
                  className="input-base text-lg font-bold text-center tracking-widest"
                  placeholder="Enter terminal approval code"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                />
                <div className="mt-4 bg-gray-50 rounded-2xl px-4 py-3 flex items-center justify-between border border-gray-200">
                  <p className="text-sm text-gray-600 font-medium">Amount to charge</p>
                  <p className="text-2xl font-black text-brand">{fmt(total)}</p>
                </div>
              </div>
            )}

            {/* Confirm button */}
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="w-full flex items-center justify-center gap-3 bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-5 px-6 rounded-2xl transition-all shadow-xl shadow-brand/30 text-lg active:scale-98"
            >
              {processing ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Processing…</>
              ) : (
                <><Check className="w-6 h-6" />Confirm Payment — {fmt(total)}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
