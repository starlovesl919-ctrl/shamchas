import { useState } from "react";
import type { GatewayConfig } from "../types";

const ENDPOINTS = [
	{
		method: "POST",
		path: "/api/shamcash/bills",
		description: "ينشئ فاتورة في شام كاش ويعيد رابط الدفع",
	},
	{
		method: "GET",
		path: "/api/shamcash/bills",
		description: "يسرد الفواتير الصادرة من هذه البوابة",
	},
	{
		method: "GET",
		path: "/api/shamcash/bills/{billNo}",
		description: "يقرأ حالة فاتورة محدّثة من شام كاش",
	},
	{
		method: "POST",
		path: "/api/shamcash/webhook",
		description: "يستقبل إشعار الدفع أو الانتهاء المشفّر",
	},
];

const METHOD_STYLES: Record<string, string> = {
	POST: "bg-emerald-50 text-emerald-700 ring-emerald-200",
	GET: "bg-sky-50 text-sky-700 ring-sky-200",
};

interface ApiReferenceProps {
	config: GatewayConfig | null;
}

export function ApiReference({ config }: ApiReferenceProps) {
	const [copied, setCopied] = useState(false);
	const callbackUrl = config?.callbackUrl ?? "/api/shamcash/webhook";

	const copyCallback = async () => {
		try {
			await navigator.clipboard.writeText(callbackUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div className="space-y-4">
			<ul className="space-y-2.5">
				{ENDPOINTS.map((endpoint) => (
					<li key={`${endpoint.method} ${endpoint.path}`}>
						<div className="flex items-center gap-2">
							<span
								className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${
									METHOD_STYLES[endpoint.method]
								}`}
							>
								{endpoint.method}
							</span>
							<code
								dir="ltr"
								className="truncate font-mono text-xs text-neutral-800"
							>
								{endpoint.path}
							</code>
						</div>
						<p className="mt-1 text-xs text-neutral-500">
							{endpoint.description}
						</p>
					</li>
				))}
			</ul>

			<div className="rounded-xl bg-neutral-900 p-3">
				<p className="text-[11px] font-medium text-neutral-400">
					رابط الـ Webhook
				</p>
				<p
					dir="ltr"
					className="mt-1 truncate text-right font-mono text-xs text-emerald-300"
				>
					{callbackUrl}
				</p>
				<button
					type="button"
					onClick={copyCallback}
					className="mt-2 inline-flex h-8 items-center rounded-lg bg-white/10 px-2.5 text-[11px] font-medium text-white transition hover:bg-white/20"
				>
					{copied ? "تم النسخ" : "نسخ الرابط"}
				</button>
			</div>

			<p className="text-xs leading-relaxed text-neutral-500">
				كل طلب يُرسل مشفّراً بـ AES-256-GCM، ويصل إشعار الدفع مشفّراً في{" "}
				<code dir="ltr" className="font-mono">
					encData
				</code>{" "}
				ويُتحقق من صلاحيته قبل تحديث الفاتورة.
			</p>
		</div>
	);
}
