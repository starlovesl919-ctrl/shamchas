import type { GatewayBill } from "../../src/types";

/**
 * Bills are kept in a KV namespace so the webhook can update the record the
 * API created, and so the console can list what this gateway issued.
 */

const BILL_PREFIX = "bill:";
const EVENT_PREFIX = "event:";
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 30;
const LIST_SCAN_LIMIT = 200;

export function loadBill(
	kv: KVNamespace,
	billNo: string,
): Promise<GatewayBill | null> {
	return kv.get<GatewayBill>(`${BILL_PREFIX}${billNo}`, "json");
}

export async function saveBill(
	kv: KVNamespace,
	bill: GatewayBill,
): Promise<void> {
	await kv.put(`${BILL_PREFIX}${bill.billNo}`, JSON.stringify(bill));
}

export async function listBills(
	kv: KVNamespace,
	limit = 25,
): Promise<GatewayBill[]> {
	const listed = await kv.list({ prefix: BILL_PREFIX, limit: LIST_SCAN_LIMIT });
	const bills = await Promise.all(
		listed.keys.map((key) => loadBill(kv, key.name.slice(BILL_PREFIX.length))),
	);

	return bills
		.filter((bill): bill is GatewayBill => bill !== null)
		.sort((left, right) => right.createdAt - left.createdAt)
		.slice(0, limit);
}

/**
 * ShamCash retries a webhook until it gets HTTP 200, so the same bill and status
 * can arrive more than once. True means this is the first delivery.
 */
export async function claimEvent(
	kv: KVNamespace,
	billNo: string,
	statusId: number,
): Promise<boolean> {
	const key = `${EVENT_PREFIX}${billNo}:${statusId}`;
	if (await kv.get(key)) return false;

	await kv.put(key, new Date().toISOString(), {
		expirationTtl: EVENT_TTL_SECONDS,
	});

	return true;
}
