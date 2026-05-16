import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, Banknote, Smartphone, Check, Tag, X, AlertCircle, Loader2 } from 'lucide-react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import { apiValidateVoucher } from '../../lib/api'
import type { Payment as PaymentType } from '../../types'

type PayMethod = 'cash' | 'gcash' | 'paymaya' | 'card'

const METHODS: { id: PayMethod; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'cash', label: 'Cash', icon: Banknote, desc: 'Physical currency' },
  { id: 'gcash', label: 'GCash', icon: Smartphone, desc: 'QR / ref number' },
  { id: 'paymaya', label: 'PayMaya', icon: Smartphone, desc: 'QR / ref number' },
  { id: 'card', label: 'Card', icon: CreditCard, desc: 'Credit / debit' },
]

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

const QUICK_CASH = [1000, 1500, 2000, 2500, 3000, 5000]

export function Payment() {
  const navigate = useNavigate()
  const { cart, cartSubtotal } = usePOSStore()
  const { user } = useAuthStore()

  const subtotal = cartSubtotal()
  const baseTotal = subtotal

  const [primaryMethod, setPrimaryMethod] = useState<PayMethod>('cash')
  const [cashInput, setCashInput] = useState(String(Math.ceil(baseTotal / 100) * 100))
  const [refInput, setRefInput] = useState('')
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherResult, setVoucherResult] = useState<{ valid: boolean; discount: number; message: string } | null>(null)
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  const voucherDiscount = voucherResult?.valid ? voucherResult.discount : 0
  const total = Math.max(0, baseTotal - voucherDiscount)
  const cashReceived = parseFloat(cashInput) || 0
  const change = Math.max(0, cashReceived - total)

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return
    setVoucherLoading(true)
    setVoucherResult(null)
    try {
      const result = await apiValidateVoucher(voucherCode.trim(), baseTotal)
      if (result.valid && result.discount_amount != null) {
        const desc = result.discount_type === 'percent'
          ? `${result.discount_value}% off`
          : `₱${result.discount_value} off`
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

  const handleRemoveVoucher = () => { setVoucherCode(''); setVoucherResult(null) }

  const handleConfirm = async () => {
    if (cart.length === 0) return
    if (primaryMethod === 'cash' && cashReceived < total) return
    setProcessing(true)
    setCheckoutError('')

    try {
      const branchId = user?.branch_id ?? 'main'
      const payments: PaymentType[] = [{
        method: primaryMethod,
        amount: primaryMethod === 'cash' ? cashReceived : total,
        reference: refInput.trim() || undefined,
      }]

      const result = await usePOSStore.getState().checkoutCart(
        branchId,
        payments,
        0,
        voucherResult?.valid ? voucherCode.trim() : undefined
      )

      navigate(`/pos/receipt/${result.id}`, {
        state: {
          transaction: {
            receiptNo: result.receipt_no,
            offline: result.offline,
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
            paid: primaryMethod === 'cash' ? cashReceived : total,
            change: primaryMethod === 'cash' ? change : 0,
            method: primaryMethod,
          },
        },
      })
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Payment failed. Please try again.')
      setProcessing(false)
    }
  }

  const canConfirm = cart.length > 0 && !processing && (
    primaryMethod !== 'cash' || cashReceived >= total
  )

  return (
    <div className="min-h-screen bg-gray-50 transition-colors">
      <div className="max-w-5xl mx-auto p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/pos')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Payment</h1>
        </div>

        {checkoutError && (
          <div className="flex items-center gap-2.5 bg-brand-pale border border-red-200 text-brand text-sm rounded-xl px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{checkoutError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* LEFT: Order Summary + Voucher */}
          <div className="space-y-4">
            {/* Order summary */}
            <div className="card p-4">
              <p className="section-label mb-3">Order Summary</p>
              {cart.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No items in cart</p>
              ) : (
                <div className="space-y-2 mb-3">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-sm gap-2">
                      <span className="text-gray-600 min-w-0 truncate">{item.product.name} × {item.quantity}</span>
                      <span className="font-medium text-gray-800 flex-shrink-0">{fmt(item.product.price * item.quantity - item.discount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-gray-100 pt-2 space-y-1">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{fmt(baseTotal)}</span>
                </div>
                {voucherDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Voucher ({voucherCode})</span>
                    <span>-{fmt(voucherDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100 text-gray-900">
                  <span>Total</span>
                  <span className="text-brand">{fmt(total)}</span>
                </div>
              </div>
            </div>

            {/* Voucher */}
            <div className="card p-4">
              <p className="section-label mb-3">Voucher / Promo Code</p>
              {voucherResult?.valid ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-green-700">{voucherCode.toUpperCase()}</p>
                      <p className="text-xs text-green-600">{voucherResult.message}</p>
                    </div>
                  </div>
                  <button onClick={handleRemoveVoucher} className="p-1 text-green-500 hover:text-green-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      className="input-base flex-1 uppercase"
                      placeholder="Enter code (e.g. WELCOME10)"
                      value={voucherCode}
                      onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherResult(null) }}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyVoucher()}
                    />
                    <button
                      onClick={handleApplyVoucher}
                      disabled={voucherLoading || !voucherCode.trim()}
                      className="btn-secondary px-3 disabled:opacity-50"
                    >
                      {voucherLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                    </button>
                  </div>
                  {voucherResult && !voucherResult.valid && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-brand">
                      <AlertCircle className="w-3.5 h-3.5" /> {voucherResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Payment Method + Confirm */}
          <div className="space-y-4">
            {/* Payment method */}
            <div className="card p-4">
              <p className="section-label mb-3">Payment Method</p>
              <div className="grid grid-cols-4 gap-2.5 mb-4">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPrimaryMethod(m.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                      primaryMethod === m.id
                        ? 'border-brand bg-brand-pale shadow-md shadow-brand/10'
                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <m.icon className={`w-5 h-5 ${primaryMethod === m.id ? 'text-brand' : 'text-gray-500'}`} />
                    <span className={`text-xs font-bold ${primaryMethod === m.id ? 'text-brand' : 'text-gray-700'}`}>{m.label}</span>
                  </button>
                ))}
              </div>

              {primaryMethod === 'cash' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Cash Received</label>
                  <input
                    type="number"
                    className="input-base text-lg font-bold text-center"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {QUICK_CASH.map((v) => (
                      <button
                        key={v}
                        onClick={() => setCashInput(String(v))}
                        className="px-3 py-2 rounded-xl bg-gray-100 text-sm font-bold text-gray-700 hover:bg-gray-200 transition-colors min-h-[40px]"
                      >₱{v.toLocaleString()}</button>
                    ))}
                    <button
                      onClick={() => setCashInput(String(Math.ceil(total)))}
                      className="px-3 py-2 rounded-xl bg-brand-pale text-sm font-bold text-brand hover:bg-red-100 transition-colors min-h-[40px]"
                    >Exact</button>
                  </div>
                </div>
              )}

              {(primaryMethod === 'gcash' || primaryMethod === 'paymaya') && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Reference Number <span className="text-brand">*</span></label>
                  <input type="text" className="input-base" placeholder="Enter reference number from app" value={refInput} onChange={(e) => setRefInput(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Ask customer to show the payment confirmation screen</p>
                </div>
              )}

              {primaryMethod === 'card' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Approval Code</label>
                  <input type="text" className="input-base" placeholder="Enter terminal approval code" value={refInput} onChange={(e) => setRefInput(e.target.value)} />
                </div>
              )}
            </div>

            {/* Change summary */}
            {primaryMethod === 'cash' && cashReceived > 0 && (
              <div className={`card p-4 ${cashReceived >= total ? 'bg-green-50 border-green-100' : 'bg-yellow-50 border-yellow-100'}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className={`text-xs font-medium ${cashReceived >= total ? 'text-green-600' : 'text-yellow-600'}`}>Amount Tendered</p>
                    <p className={`text-xl font-bold ${cashReceived >= total ? 'text-green-700' : 'text-yellow-700'}`}>{fmt(cashReceived)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-medium ${cashReceived >= total ? 'text-green-600' : 'text-yellow-600'}`}>
                      {cashReceived >= total ? 'Change' : 'Still needed'}
                    </p>
                    <p className={`text-xl font-bold ${cashReceived >= total ? 'text-green-700' : 'text-yellow-700'}`}>
                      {cashReceived >= total ? fmt(change) : fmt(total - cashReceived)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="btn-primary w-full justify-center py-4 text-base rounded-2xl disabled:opacity-40 shadow-lg shadow-brand/20"
            >
              {processing ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Processing...</>
              ) : (
                <><Check className="w-5 h-5" />Confirm Payment — {fmt(total)}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
