import { ArrowClockwise, Brain, Info } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type {
  RuntimeLaunchProfile,
  RuntimeModelState,
} from "../types";

interface RuntimeModelSettingsProps {
  preview: boolean;
  runtimeAvailable: boolean;
  canApplyToCurrent: boolean;
  taskHasConversation: boolean;
  loading: boolean;
  configuring: boolean;
  disabled: boolean;
  modelState: RuntimeModelState | null;
  runtimeProfile: RuntimeLaunchProfile | null;
  defaultRuntimeProfile: RuntimeLaunchProfile;
  onConfigure: (profile: RuntimeLaunchProfile) => Promise<void>;
  onRefresh: () => Promise<unknown>;
}

export function RuntimeModelSettings({
  preview,
  runtimeAvailable,
  canApplyToCurrent,
  taskHasConversation,
  loading,
  configuring,
  disabled,
  modelState,
  runtimeProfile,
  defaultRuntimeProfile,
  onConfigure,
  onRefresh,
}: RuntimeModelSettingsProps) {
  const { formatNumber, t } = useI18n();
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState("");
  const selectedModel = useMemo(
    () =>
      modelState?.availableModels.find(
        (model) => model.modelId === selectedModelId,
      ) ?? null,
    [modelState, selectedModelId],
  );

  useEffect(() => {
    if (!modelState) {
      setSelectedModelId("");
      setSelectedReasoningEffort("");
      return;
    }
    const nextModel =
      modelState.availableModels.find(
        (model) => model.modelId === defaultRuntimeProfile.modelId,
      ) ??
      modelState.availableModels.find(
        (model) => model.modelId === runtimeProfile?.modelId,
      ) ??
      modelState.availableModels.find(
        (model) => model.modelId === modelState.currentModelId,
      ) ??
      modelState.availableModels[0];
    if (!nextModel) {
      setSelectedModelId("");
      setSelectedReasoningEffort("");
      return;
    }
    const nextEffort =
      nextModel.reasoningEfforts.find(
        (effort) => effort.value === defaultRuntimeProfile.reasoningEffort,
      ) ??
      nextModel.reasoningEfforts.find(
        (effort) => effort.value === runtimeProfile?.reasoningEffort,
      ) ??
      nextModel.reasoningEfforts.find(
        (effort) => effort.value === modelState.currentReasoningEffort,
      ) ??
      nextModel.reasoningEfforts.find((effort) => effort.default) ??
      nextModel.reasoningEfforts[0];
    setSelectedModelId(nextModel.modelId);
    setSelectedReasoningEffort(nextEffort?.value ?? "");
  }, [defaultRuntimeProfile, modelState, runtimeProfile]);

  const formatProfile = (
    profile: RuntimeLaunchProfile,
    fallbackModelId: string | null = null,
  ) => {
    const modelId = profile.modelId ?? fallbackModelId;
    if (!modelId) return t("models.followRuntimeDefault");
    const model = modelState?.availableModels.find(
      (candidate) => candidate.modelId === modelId,
    );
    const effort = model?.reasoningEfforts.find(
      (candidate) => candidate.value === profile.reasoningEffort,
    );
    return `${model?.name ?? modelId} · ${
      effort?.label ?? t("models.runtimeDefaultEffort")
    }`;
  };

  const chooseModel = (modelId: string) => {
    setSelectedModelId(modelId);
    const model = modelState?.availableModels.find(
      (candidate) => candidate.modelId === modelId,
    );
    const effort =
      model?.reasoningEfforts.find((candidate) => candidate.default) ??
      model?.reasoningEfforts[0];
    setSelectedReasoningEffort(effort?.value ?? "");
  };

  if (preview) {
    return (
      <div className="model-settings model-settings--empty">
        <Brain size={22} />
        <div>
          <strong>{t("models.previewTitle")}</strong>
          <p>{t("models.previewDescription")}</p>
        </div>
      </div>
    );
  }

  if (!modelState || modelState.availableModels.length === 0) {
    return (
      <div className="model-settings model-settings--empty">
        <Brain size={22} />
        <div>
          <strong>{t("models.emptyTitle")}</strong>
          <p>{t("models.emptyDescription")}</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={!runtimeAvailable || loading || disabled}
          onClick={() => void onRefresh().catch(() => undefined)}
        >
          <ArrowClockwise size={16} className={loading ? "spin" : undefined} />
          {loading ? t("models.loading") : t("models.load")}
        </button>
      </div>
    );
  }

  return (
    <div className="model-settings">
      <div className="model-settings__heading">
        <span className="settings-row__icon"><Brain size={21} /></span>
        <span>
          <strong>{selectedModel?.name ?? modelState.currentModelId}</strong>
          <small>
            {selectedModel?.description ??
              t("models.descriptionFallback")}
          </small>
        </span>
        <button
          type="button"
          className="icon-button"
          title={t("models.refresh")}
          aria-label={t("models.refresh")}
          disabled={loading || configuring}
          onClick={() => void onRefresh().catch(() => undefined)}
        >
          <ArrowClockwise size={15} className={loading ? "spin" : undefined} />
        </button>
      </div>
      <div className="model-settings__form">
        <label>
          <span>{t("models.model")}</span>
          <select
            value={selectedModelId}
            disabled={configuring || disabled}
            onChange={(event) => chooseModel(event.target.value)}
          >
            {modelState.availableModels.map((model) => (
              <option key={model.modelId} value={model.modelId}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("models.reasoningEffort")}</span>
          <select
            value={selectedReasoningEffort}
            disabled={
              configuring ||
              disabled ||
              !selectedModel ||
              selectedModel.reasoningEfforts.length === 0
            }
            onChange={(event) =>
              setSelectedReasoningEffort(event.target.value)
            }
          >
            {selectedModel?.reasoningEfforts.length ? (
              selectedModel.reasoningEfforts.map((effort) => (
                <option key={effort.id} value={effort.value}>
                  {effort.label}
                </option>
              ))
            ) : (
              <option value="">{t("models.runtimeDefault")}</option>
            )}
          </select>
        </label>
      </div>
      <dl className="model-settings__facts">
        <div>
          <dt>{t("models.currentTask")}</dt>
          <dd>
            {runtimeProfile
              ? formatProfile(runtimeProfile, modelState.currentModelId)
              : t("context.noActiveTask")}
          </dd>
        </div>
        <div>
          <dt>{t("models.newTaskDefault")}</dt>
          <dd>
            {formatProfile(defaultRuntimeProfile, modelState.currentModelId)}
          </dd>
        </div>
        <div>
          <dt>{t("models.contextWindow")}</dt>
          <dd>
            {selectedModel?.totalContextTokens
              ? t("models.tokens", {
                  count: formatNumber(selectedModel.totalContextTokens),
                })
              : t("models.notProvided")}
          </dd>
        </div>
      </dl>
      <div className="model-settings__notice" role="status">
        <Info size={16} />
        <span>
          {taskHasConversation
            ? t("models.notice.conversation")
            : canApplyToCurrent
              ? t("models.notice.applyCurrent")
              : t("models.notice.defaultOnly")}
        </span>
      </div>
      <div className="runtime-summary__actions">
        <button
          type="button"
          className="primary-button"
          disabled={!selectedModelId || configuring || disabled}
          onClick={() =>
            void onConfigure({
              modelId: selectedModelId,
              reasoningEffort: selectedReasoningEffort || null,
            }).catch(() => undefined)
          }
        >
          <ArrowClockwise
            size={16}
            className={configuring ? "spin" : undefined}
          />
          {configuring
            ? t("models.applying")
            : canApplyToCurrent
              ? t("models.saveApply")
              : taskHasConversation
                ? t("models.setNewTaskDefault")
                : t("models.saveNewTaskDefault")}
        </button>
      </div>
    </div>
  );
}
