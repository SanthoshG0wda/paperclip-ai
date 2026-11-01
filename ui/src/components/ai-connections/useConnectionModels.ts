import { useQuery } from "@tanstack/react-query";
import { aiRoutingModel, type AiConnectionBinding, type AiProviderRouting } from "@paperclipai/shared";
import { aiConnectionsApi } from "@/api/ai-connections";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";

export function useConnectionModelsState(
  companyId: string | null | undefined,
  binding: AiConnectionBinding | undefined,
  harness: string,
) {
  const connectionId = binding && "connectionId" in binding ? binding.connectionId : undefined;
  const grantId = binding && "grantId" in binding ? binding.grantId : undefined;
  const accounts = useQuery({
    queryKey: ["ai-connections", companyId, binding?.mode, connectionId, grantId, binding?.provider],
    queryFn: () => aiConnectionsApi.list(companyId!),
    enabled: Boolean(companyId && binding),
  });
  const connection = accounts.data?.connections.find((c) =>
    binding?.mode === "responsible_user"
      ? c.provider === binding.provider && c.isDefault && c.ownerUserId === accounts.data?.currentUserId && c.ownership === "personal"
      : c.id === binding?.connectionId && c.grantId === binding?.grantId,
  );
  const routing = connection?.routing;
  const openRouter = routing?.kind === "openrouter" || (!routing && binding?.provider === "openrouter");
  const connectionCatalog = routing && ["gateway", "local"].includes(routing.kind) && !routing.models.length;
  const discover = (openRouter && !routing?.models.length) || connectionCatalog;
  // Reuse the existing public catalog and its query cache. It returns OpenCode IDs;
  // strip only that transport prefix for other harnesses (openrouter/auto is
  // itself a valid upstream model ID).
  const catalog = useQuery({
    queryKey: queryKeys.agents.adapterModels(companyId ?? "none", "opencode_local", null, connectionCatalog ? JSON.stringify(binding ?? null) : "openrouter"),
    queryFn: () => agentsApi.adapterModels(companyId!, "opencode_local", connectionCatalog
      ? { provider: binding?.provider, aiConnection: binding, refresh: true }
      : { provider: "openrouter" }),
    enabled: Boolean(companyId && accounts.data && discover),
    staleTime: 60_000,
    retry: false,
  });
  const effectiveRouting: AiProviderRouting | undefined = routing ?? (openRouter
    ? { kind: "openrouter", protocol: "chat", auth: "bearer", models: [] }
    : undefined);
  const modelOptions = discover
    ? (catalog.data ?? []).map((m) => ({ ...m, id: openRouter && ["opencode_local", "pi_local"].includes(harness) ? m.id : m.id.replace(/^openrouter\//, "") }))
    : routing?.models ?? [];
  const connectionModels = effectiveRouting
    ? {
        models: modelOptions.map((m) => ({
          id: aiRoutingModel(effectiveRouting, harness, m.id),
          label: m.label ?? m.id,
        })),
        isLoading: discover && catalog.isLoading,
        error: discover ? catalog.error : null,
        refreshing: discover && catalog.isFetching,
        refreshModels: discover ? async () => { await catalog.refetch(); } : undefined,
        resolveModel: (model: string) =>
          aiRoutingModel(effectiveRouting, harness, model),
      }
    : undefined;
  return {
    connectionModels,
    loading: accounts.isLoading,
    refreshing: accounts.isFetching,
    error: accounts.error,
    refresh: async () => { await accounts.refetch(); },
  };
}

export function useConnectionModels(
  companyId: string | null | undefined,
  binding: AiConnectionBinding | undefined,
  harness: string,
) {
  return useConnectionModelsState(companyId, binding, harness).connectionModels;
}
