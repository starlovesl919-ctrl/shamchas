import type { ReactNode } from "react";

interface CardProps {
	title: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}

export function Card({ title, description, action, children }: CardProps) {
	return (
		<section className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 className="text-sm font-bold text-neutral-900">{title}</h2>
					{description ? (
						<p className="mt-1 text-xs text-neutral-500">{description}</p>
					) : null}
				</div>
				{action}
			</div>
			<div className="mt-4">{children}</div>
		</section>
	);
}
