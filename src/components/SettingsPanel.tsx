import { useState } from "react";
import {
  validateApiKey,
  HAS_BUILTIN_KEYS,
} from "../lib/mimo";

interface SettingsPanelProps {
  apiKey: string;
  overrideKey: string;
  hasKey: boolean;
  onKeyChange: (key: string) => void;
  useCascade?: boolean;
  onCascadeChange?: (v: boolean) => void;
}

export function SettingsPanel({
  apiKey,
  overrideKey,
  hasKey,
  onKeyChange,
  useCascade,
  onCascadeChange,
}: SettingsPanelProps) {
  const [keyCheck, setKeyCheck] = useState<{
    status: "idle" | "checking" | "ok" | "fail";
    msg?: string;
  }>({ status: "idle" });

  async function handleCheckKey() {
    if (!apiKey) {
      setKeyCheck({ status: "fail", msg: "пустой ключ" });
      return;
    }
    setKeyCheck({ status: "checking" });
    const r = await validateApiKey(apiKey);
    setKeyCheck(
      r.ok ? { status: "ok", msg: r.label } : { status: "fail", msg: r.error },
    );
  }

  return (
    <section className="settings">
      <div className={`key-row ${hasKey ? "key-ok" : "key-missing"}`}>
        <label>
          <strong>MiMo (Xiaomi) API key</strong>
          <input
            type="password"
            value={overrideKey}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="mimo-…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="muted small">
          {overrideKey ? (
            "Ключ сохранён в браузере (localStorage). На GitHub или куда-то ещё он не уходит — только в Xiaomi MiMo (Сингапур), который доступен из РФ без VPN."
          ) : HAS_BUILTIN_KEYS ? (
            <>
              ✓ Встроенные ключи MiMo доступны (с автоматической ротацией, 200M
              кредитов на аккаунт). Поле выше — необязательное переопределение
              своим ключом. Получить свой можно на{" "}
              <a href="https://xiaomimimo.com" target="_blank" rel="noreferrer">
                xiaomimimo.com
              </a>
              .
            </>
          ) : (
            <>
              Без ключа перевод работать не будет. Получить ключ MiMo можно на{" "}
              <a href="https://xiaomimimo.com" target="_blank" rel="noreferrer">
                xiaomimimo.com
              </a>
              . Эндпоинт — Сингапур, доступен из РФ без VPN. Ключ хранится только
              в этом браузере.
            </>
          )}
        </p>
        <div className="key-check-row">
          <button
            className="ghost"
            onClick={handleCheckKey}
            disabled={!hasKey || keyCheck.status === "checking"}
          >
            {keyCheck.status === "checking" ? "Проверка…" : "Проверить ключ"}
          </button>
          {keyCheck.status === "ok" && (
            <span className="key-check-ok">✓ {keyCheck.msg}</span>
          )}
          {keyCheck.status === "fail" && (
            <span className="key-check-fail">✗ {keyCheck.msg}</span>
          )}
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        Модель перевода: <strong>MiMo V2.5</strong> · vision/OCR. Автоматически смотрит на каждую страницу как картинку — формулы и графики переводятся «глазами», а не текстом.
      </p>
      {onCascadeChange && (
        <label className="muted small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <input
            type="checkbox"
            checked={!!useCascade}
            onChange={(e) => onCascadeChange(e.target.checked)}
          />
          <span>
            <strong>v2 каскад</strong> · 5 проходов (omni → omni-mid → flash → pro → flash). Дороже, точнее формулы и фигуры.
          </span>
        </label>
      )}
    </section>
  );
}
