import type { GatewayBill } from "../types";
import { formatAmount, formatTime } from "../lib/gateway";
import { StatusBadge } from "./StatusBadge";

interface BillsListProps {
	bills: GatewayBill[];
	loading: boolean;
	refreshing: string | null;
	onRefresh: (billNo: string) => void;
}

export function BillsList({
	bills,
	loading,
	refreshing,
	onRefresh,
}: BillsListProps) {
	if (loading) {
		return <p className="py-6 text-center text-sm text-neutral-500">جارٍ التحميل…</p>;
	}

	if (bills.length === 0) {
		return (
			<p className="py-6 text-center text-sm text-neutral-500">
				لا توجد فواتير بعد — أنشئ أول فاتورة لتظهر هنا.
			</p>
		);
	}

	return (
		<ul className="divide-y divide-neutral-100">
			{bills.map((bill) => (
				<li
					key={bill.billNo}
					className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
				>
					<div className="min-w-0 flex-1">
						<p
							dir="ltr"
							className="truncate text-right font-mono text-xs text-neutral-500"
						>
							{bill.billNo}
						</p>
						<p className="mt-0.5 text-sm font-semibold text-neutral-900">
							{formatAmount(bill)}
							{bill.note ? (
								<span className="font-normal text-neutral-500">
									{" · "}
									{bill.note}
								</span>
							) : null}
						</p>
						<p className="mt-0.5 text-xs text-neutral-400">
							{formatTime(bill.createdAt)}
						</p>
					</div>

					<StatusBadge
						statusId={bill.statusId}
						statusName={bill.statusName}
					/>

					<button
						type="button"
						onClick={() => onRefresh(bill.billNo)}
						disabled={refreshing === bill.billNo}
						className="inline-flex h-9 items-center rounded-xl border border-neutral-200 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{refreshing === bill.billNo ? "جارٍ التحديث…" : "تحديث الحالة"}
					</button>
				</li>
			))}
		</ul>
	);
}
