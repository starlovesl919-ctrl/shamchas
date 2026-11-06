import type { GatewayBill, GatewayConfig } from "../types";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, init);
	const body: unknown = await response.json().catch(() => null);

	if (!response.ok) {
		const message =
			body &&
			typeof body === "object" &&
			typeof (body as { error?: unknown }).error === "string"
				? (body as { error: string }).error
				: `تعذّر تنفيذ الطلب (HTTP ${response.status}).`;
		throw new Error(message);
	}

	return body as T;
}

export function loadConfig(): Promise<GatewayConfig> {
	return requestJson<GatewayConfig>("/api/shamcash/config");
}

export function loadBills(): Promise<GatewayBill[]> {
	return requestJson<GatewayBill[]>("/api/shamcash/bills");
}

export function createGatewayBill(input: {
	amount: string;
	currency: string;
	note: string;
}): Promise<GatewayBill> {
	return requestJson<GatewayBill>("/api/shamcash/bills", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
}

export function refreshGatewayBill(billNo: string): Promise<GatewayBill> {
	return requestJson<GatewayBill>(
		`/api/shamcash/bills/${encodeURIComponent(billNo)}`,
	);
}

export function formatAmount(bill: GatewayBill): string {
	const value = bill.amount === "" ? "—" : bill.amount;

	return bill.currencyId === 2 ? `${value} ل.س` : `${value} $`;
}

export function formatTime(timestamp: number): string {
	return new Intl.DateTimeFormat("ar", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(timestamp));
}
