"use client";

import { useState } from "react";
import { btnGhostCls } from "@/components/ui";
import type { ReceiptData } from "@/lib/receipt";
import { buildEscPosBytes } from "@/lib/receipt";

// UUID layanan/karakteristik yang paling umum dipakai printer thermal BLE
// murah (merek-merek generik Cina yang banyak dijual untuk UKM). Printer
// lain kemungkinan memakai UUID berbeda dan tidak akan terdeteksi di sini.
const CANDIDATE_SERVICES = ["49535343-fe7d-4ae5-8fa9-9fafd205e455", "000018f0-0000-1000-8000-00805f9b34fb"];
const CANDIDATE_WRITE_CHARS = ["49535343-8841-43f4-a8d4-ecbe34729bb3", "00002af1-0000-1000-8000-00805f9b34fb"];

type Status = "idle" | "connecting" | "sending" | "done" | "error" | "unsupported";

// Minimal ambient types supaya TypeScript tidak protes — Web Bluetooth
// belum punya definisi tipe bawaan di lib DOM standar.
type BtDevice = { gatt?: { connect(): Promise<BtServer> } };
type BtServer = {
  getPrimaryService(uuid: string): Promise<BtService>;
};
type BtService = { getCharacteristic(uuid: string): Promise<BtCharacteristic> };
type BtCharacteristic = { writeValueWithoutResponse?(v: BufferSource): Promise<void>; writeValue(v: BufferSource): Promise<void> };

async function findWritable(device: BtDevice): Promise<BtCharacteristic> {
  if (!device.gatt) throw new Error("Perangkat tidak mendukung GATT.");
  const server = await device.gatt.connect();
  for (const svc of CANDIDATE_SERVICES) {
    try {
      const service = await server.getPrimaryService(svc);
      for (const chr of CANDIDATE_WRITE_CHARS) {
        try {
          return await service.getCharacteristic(chr);
        } catch {
          // coba karakteristik berikutnya
        }
      }
    } catch {
      // coba layanan berikutnya
    }
  }
  throw new Error("Printer ditemukan tapi layanan cetaknya tidak dikenali oleh aplikasi ini.");
}

export default function BluetoothPrint({ data, widthMm }: { data: ReceiptData; widthMm: number }) {
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string | null>(null);

  async function print() {
    setErr(null);
    const nav = navigator as Navigator & { bluetooth?: { requestDevice(opts: unknown): Promise<BtDevice> } };
    if (!nav.bluetooth) {
      setStatus("unsupported");
      return;
    }
    setStatus("connecting");
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATE_SERVICES,
      });
      const characteristic = await findWritable(device);
      setStatus("sending");

      const bytes = buildEscPosBytes(data, widthMm);
      const CHUNK = 20; // aman untuk MTU BLE bawaan kebanyakan printer murah
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.slice(i, i + CHUNK);
        if (characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
        else await characteristic.writeValue(chunk);
        await new Promise((r) => setTimeout(r, 20));
      }
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErr(e instanceof Error ? e.message : "Gagal terhubung atau mencetak ke printer.");
    }
  }

  if (status === "unsupported") {
    return (
      <p className="text-xs text-stone-500">
        Perangkat atau browser ini tidak mendukung cetak Bluetooth langsung. Gunakan tombol &quot;Cetak&quot; biasa
        di atas, pilih printer Bluetooth dari situ kalau sudah terpasang sebagai printer di HP Anda.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        className={`${btnGhostCls} w-full`}
        onClick={print}
        disabled={status === "connecting" || status === "sending"}
      >
        {status === "connecting"
          ? "Menghubungkan ke printer…"
          : status === "sending"
            ? "Mengirim ke printer…"
            : "Cetak via Bluetooth (eksperimental)"}
      </button>
      {status === "done" && <p className="text-xs font-medium text-brand-800">Terkirim ke printer.</p>}
      {status === "error" && (
        <p className="text-xs text-red-700">
          {err} Printer Anda mungkin memakai protokol berbeda dari yang didukung di sini — coba tombol
          &quot;Cetak&quot; biasa sebagai gantinya.
        </p>
      )}
      <p className="text-xs text-stone-400">
        Eksperimental. Hanya jalan di Chrome (Android/komputer), dan hanya untuk printer Bluetooth Low Energy
        yang kompatibel. Tidak jalan di iPhone/Safari.
      </p>
    </div>
  );
}
