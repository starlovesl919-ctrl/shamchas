import { useState } from "react";
import type { FormEvent } from "react";
import type { CurrencyCode, GatewayBill } from "../types";
import { createGatewayBill, formatAmount } from "../lib/gateway";
import { StatusBadge } from "./StatusBadge";

const CURRENCIES: CurrencyCode[] = ["USD", "SYP"];

interface NewBillFormProps {
	onCreated: (bill: GatewayBill) => void;
}

export function NewBillForm({ onCreated }: NewBillFormProps) {
	const [amount, setAmount] = useState("");
	const [currency, setCurrency] = useState<CurrencyCode>("USD");
	const [note, setNote] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [created, setCreated] = useState<GatewayBill | null>(null);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitting(true);
		setError(null);

		try {
			const bill = await createGatewayBill({ amount, currency, note });
			setCreated(bill);
			onCreated(bill);
			setAmount("");
			setNote("");
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "تعذّر إنشاء الفاتورة.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="space-y-4">
			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-[1fr_auto]">
					<label className="block">
						<span className="mb-1.5 block text-xs font-medium text-neutral-600">
							المبلغ
						</span>
						<input
							type="text"
							inputMode="decimal"
							required
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							placeholder="10.50"
							dir="ltr"
							className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
						/>
					</label>

					<div>
						<span className="mb-1.5 block text-xs font-medium text-neutral-600">
							العملة
						</span>
						<div className="flex h-11 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
							{CURRENCIES.map((code) => (
								<button
									key={code}
									type="button"
									onClick={() => setCurrency(code)}
									aria-pressed={currency === code}
									className={`min-w-14 rounded-lg px-3 text-xs font-semibold transition ${
										currency === code
											? "bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200"
											: "text-neutral-500 hover:text-neutral-700"
									}`}
								>
									{code}
								</button>
							))}
						</div>
					</div>
				</div>

				<label className="block">
					<span className="mb-1.5 block text-xs font-medium text-neutral-600">
						وصف الفاتورة <span className="text-neutral-400">(اختياري)</span>
					</span>
					<input
						type="text"
						value={note}
						onChange={(event) => setNote(event.target.value)}
						placeholder="طلب رقم 123"
						maxLength={200}
						className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
					/>
				</label>

				<button
					type="submit"
					disabled={submitting}
					className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
				>
					{submitting ? "جارٍ الإنشاء…" : "إنشاء فاتورة"}
				</button>

				<p aria-live="polite" className="text-xs text-rose-600">
					{error ?? ""}
				</p>
			</form>

			{created ? (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="text-sm font-semibold text-emerald-900">
							تم إنشاء الفاتورة
						</p>
						<StatusBadge
							statusId={created.statusId}
							statusName={created.statusName}
						/>
					</div>
					<p
						dir="ltr"
						className="mt-2 truncate font-mono text-xs text-emerald-900/70"
					>
						{created.billNo}
					</p>
					<p className="mt-1 text-sm font-semibold text-emerald-900">
						{formatAmount(created)}
					</p>
					{created.paymentUrl ? (
						<a
							href={created.paymentUrl}
							target="_blank"
							rel="noreferrer"
							className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
						>
							فتح صفحة الدفع
						</a>
					) : (
						<p className="mt-3 text-xs text-emerald-800">
							لم تُعد شام كاش رابط دفع لهذه الفاتورة.
						</p>
					)}
				</div>
			) : null}
		</div>
	);
}
