const STATUS_STYLES: Record<
	number,
	{ label: string; className: string; dot: string }
> = {
	1: {
		label: "بانتظار الدفع",
		className: "bg-amber-50 text-amber-700 ring-amber-200",
		dot: "bg-amber-500",
	},
	2: {
		label: "مُسترجع",
		className: "bg-sky-50 text-sky-700 ring-sky-200",
		dot: "bg-sky-500",
	},
	3: {
		label: "منتهية",
		className: "bg-neutral-100 text-neutral-600 ring-neutral-200",
		dot: "bg-neutral-400",
	},
	4: {
		label: "مدفوعة",
		className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
		dot: "bg-emerald-500",
	},
	5: {
		label: "استرجاع جزئي",
		className: "bg-sky-50 text-sky-700 ring-sky-200",
		dot: "bg-sky-500",
	},
};

interface StatusBadgeProps {
	statusId: number;
	statusName: string;
}

export function StatusBadge({ statusId, statusName }: StatusBadgeProps) {
	const style = STATUS_STYLES[statusId] ?? {
		label: statusName || "غير معروفة",
		className: "bg-neutral-100 text-neutral-600 ring-neutral-200",
		dot: "bg-neutral-400",
	};

	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${style.className}`}
		>
			<span className={`size-1.5 rounded-full ${style.dot}`} />
			{style.label}
		</span>
	);
}
