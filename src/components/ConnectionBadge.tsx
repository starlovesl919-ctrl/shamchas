import type { GatewayConfig } from "../types";

interface ConnectionBadgeProps {
	config: GatewayConfig | null;
}

export function ConnectionBadge({ config }: ConnectionBadgeProps) {
	if (!config) {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500 ring-1 ring-neutral-200">
				<span className="size-1.5 animate-pulse rounded-full bg-neutral-400" />
				جارٍ التحقق
			</span>
		);
	}

	if (config.configured) {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
				<span className="size-1.5 rounded-full bg-emerald-500" />
				متصل بشام كاش
			</span>
		);
	}

	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200"
			title={`المفاتيح الناقصة: ${config.missing.join(", ")}`}
		>
			<span className="size-1.5 rounded-full bg-amber-500" />
			بانتظار المفاتيح
		</span>
	);
}
