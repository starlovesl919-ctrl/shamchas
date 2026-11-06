import { useCallback, useEffect, useState } from "react";
import type { GatewayBill, GatewayConfig } from "./types";
import { loadBills, loadConfig, refreshGatewayBill } from "./lib/gateway";
import { Card } from "./components/Card";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { NewBillForm } from "./components/NewBillForm";
import { BillsList } from "./components/BillsList";
import { ApiReference } from "./components/ApiReference";

function App() {
	const [config, setConfig] = useState<GatewayConfig | null>(null);
	const [bills, setBills] = useState<GatewayBill[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState<string | null>(null);

	const reload = useCallback(async () => {
		try {
			const [nextConfig, nextBills] = await Promise.all([
				loadConfig(),
				loadBills(),
			]);
			setConfig(nextConfig);
			setBills(nextBills);
			setError(null);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "تعذّر تحميل بيانات البوابة.",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const handleCreated = (bill: GatewayBill) => {
		setBills((previous) => [
			bill,
			...previous.filter((item) => item.billNo !== bill.billNo),
		]);
	};

	const handleRefresh = async (billNo: string) => {
		setRefreshing(billNo);

		try {
			const bill = await refreshGatewayBill(billNo);
			setBills((previous) =>
				previous.map((item) => (item.billNo === billNo ? bill : item)),
			);
			setError(null);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "تعذّر تحديث حالة الفاتورة.",
			);
		} finally {
			setRefreshing(null);
		}
	};

	return (
		<div
			dir="rtl"
			lang="ar"
			className="min-h-screen bg-neutral-50 text-neutral-900"
		>
			<header className="sticky top-0 z-10 border-b border-neutral-200/70 bg-white/85 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5">
					<div className="flex min-w-0 items-center gap-3">
						<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
							ش
						</span>
						<div className="min-w-0">
							<h1 className="truncate text-base font-bold text-neutral-900">
								بوابة شام كاش
							</h1>
							<p className="truncate text-xs text-neutral-500">
								واجهة دفع للمتاجر · فواتير + Webhook
							</p>
						</div>
					</div>

					<ConnectionBadge config={config} />
				</div>
			</header>

			<main className="mx-auto grid max-w-5xl gap-4 px-4 py-5 lg:grid-cols-5">
				<div className="lg:col-span-3">
					<Card
						title="فاتورة جديدة"
						description="يُنشئ فاتورة في شام كاش ويعيد رابط صفحة الدفع."
					>
						<NewBillForm onCreated={handleCreated} />
					</Card>
				</div>

				<div className="lg:col-span-2">
					<Card
						title="نقاط الـ API"
						description="البوابة جاهزة للربط من نظامك."
					>
						<ApiReference config={config} />
					</Card>
				</div>

				<div className="lg:col-span-5">
					<Card
						title="الفواتير"
						description="حالة كل فاتورة تُحدَّث من شام كاش أو من الـ webhook."
						action={
							<button
								type="button"
								onClick={() => void reload()}
								className="inline-flex h-8 items-center rounded-lg border border-neutral-200 px-2.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
							>
								إعادة التحميل
							</button>
						}
					>
						<p aria-live="polite" className="mb-2 text-xs text-rose-600">
							{error ?? ""}
						</p>
						<BillsList
							bills={bills}
							loading={loading}
							refreshing={refreshing}
							onRefresh={(billNo) => void handleRefresh(billNo)}
						/>
					</Card>
				</div>
			</main>

			<footer className="mx-auto max-w-5xl px-4 pb-8 pt-2">
				<p className="text-xs text-neutral-400">
					المفاتيح تُخزَّن على الخادم فقط ·{" "}
					<a
						href="https://www.shamcash.sy"
						target="_blank"
						rel="noreferrer"
						className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-600"
					>
						موقع شام كاش
					</a>
				</p>
			</footer>
		</div>
	);
}

export default App;
