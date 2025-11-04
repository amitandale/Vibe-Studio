"use client";

import React from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { ProviderTokenRecord, ProviderDescriptor, TokenValidationResult } from "@/lib/api/types";

interface TokenStepProps {
  providers: ProviderDescriptor[];
  tokens: ProviderTokenRecord[];
  validatingProviderId: string | null;
  onValidate: (providerId: string, token: string, label?: string) => Promise<TokenValidationResult | void>;
  onRemoveToken: (tokenId: string) => void;
  error?: string | null;
}

export function TokenStep({
  providers,
  tokens,
  validatingProviderId,
  onValidate,
  onRemoveToken,
  error,
}: TokenStepProps): React.ReactNode {
  const [selectedProvider, setSelectedProvider] = React.useState<string>(providers[0]?.id ?? "");
  const [tokenValue, setTokenValue] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [status, setStatus] = React.useState<TokenValidationResult | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (providers.length > 0 && !providers.some((provider) => provider.id === selectedProvider)) {
      setSelectedProvider(providers[0]?.id ?? "");
    }
  }, [providers, selectedProvider]);

  const handleSubmit = React.useCallback<React.FormEventHandler<HTMLFormElement>>(
    async (event) => {
      event.preventDefault();
      if (!selectedProvider || !tokenValue) {
        return;
      }
      setPending(true);
      setStatus(null);
      try {
        const result = await onValidate(selectedProvider, tokenValue, label.trim() || undefined);
        if (result) {
          setStatus(result);
        }
        setTokenValue("");
        setLabel("");
      } catch (validationError) {
        setStatus({
          providerId: selectedProvider,
          valid: false,
          message: validationError instanceof Error ? validationError.message : String(validationError),
        });
      } finally {
        setPending(false);
      }
    },
    [label, onValidate, selectedProvider, tokenValue],
  );

  const renderTokenStatus = (token: ProviderTokenRecord) => {
    if (token.status === "valid") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
          <ShieldCheck className="h-3 w-3" /> Valid
        </span>
      );
    }
    if (token.status === "invalid") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-rose-300">
          <ShieldAlert className="h-3 w-3" /> Invalid
        </span>
      );
    }
    return <span className="text-xs text-slate-400">Pending validation</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Connect your LLM provider</h2>
        <p className="mt-2 text-sm text-slate-400">
          Provide at least one valid API token. Tokens are encrypted before storage and scoped per project.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <label className="flex-1 text-sm text-slate-300">
            Provider
            <select
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name ?? provider.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-sm text-slate-300">
            Token
            <input
              value={tokenValue}
              onChange={(event) => setTokenValue(event.target.value)}
              placeholder="sk-..."
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
              type="password"
              required
            />
          </label>
          <label className="flex-1 text-sm text-slate-300">
            Friendly label (optional)
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Prod token"
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
              type="text"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pending || !selectedProvider || !tokenValue}
          className="inline-flex items-center justify-center rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {validatingProviderId === selectedProvider || pending ? "Validating…" : "Validate token"}
        </button>
      </form>
      {status ? (
        <div
          className={
            status.valid
              ? "rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200"
              : "rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200"
          }
        >
          {status.message ?? (status.valid ? "Token validated successfully." : "Token could not be validated.")}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Configured tokens</h3>
        {tokens.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No tokens stored yet. Add a token above to unlock the wizard.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                <div>
                  <p className="font-semibold text-slate-100">{token.label ?? token.providerId}</p>
                  <p className="text-xs text-slate-500">Provider: {token.providerId}</p>
                  <p className="text-xs text-slate-500">Added {new Date(token.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  {renderTokenStatus(token)}
                  <button
                    type="button"
                    onClick={() => onRemoveToken(token.id)}
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition hover:border-rose-400/60 hover:text-rose-200"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

