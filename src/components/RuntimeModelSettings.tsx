import { ArrowClockwise, Brain, Info } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
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
    if (!modelId) return "跟随官方 Runtime 默认值";
    const model = modelState?.availableModels.find(
      (candidate) => candidate.modelId === modelId,
    );
    const effort = model?.reasoningEfforts.find(
      (candidate) => candidate.value === profile.reasoningEffort,
    );
    return `${model?.name ?? modelId} · ${
      effort?.label ?? "Runtime 默认推理强度"
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
          <strong>浏览器预览不模拟模型目录</strong>
          <p>安装版只展示官方 Grok Runtime 在 ACP 初始化时真实返回的模型和推理强度。</p>
        </div>
      </div>
    );
  }

  if (!modelState || modelState.availableModels.length === 0) {
    return (
      <div className="model-settings model-settings--empty">
        <Brain size={22} />
        <div>
          <strong>尚未读取官方模型目录</strong>
          <p>直接读取官方 Runtime 的 ACP 初始化元数据，不创建任务会话，也不会读取账号凭据。</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={!runtimeAvailable || loading || disabled}
          onClick={() => void onRefresh().catch(() => undefined)}
        >
          <ArrowClockwise size={16} className={loading ? "spin" : undefined} />
          {loading ? "正在读取…" : "读取官方模型"}
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
              "模型信息由当前官方 Grok Runtime 提供。"}
          </small>
        </span>
        <button
          type="button"
          className="icon-button"
          title="刷新官方模型目录"
          aria-label="刷新官方模型目录"
          disabled={loading || configuring}
          onClick={() => void onRefresh().catch(() => undefined)}
        >
          <ArrowClockwise size={15} className={loading ? "spin" : undefined} />
        </button>
      </div>
      <div className="model-settings__form">
        <label>
          <span>Model</span>
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
          <span>Reasoning effort</span>
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
              <option value="">Runtime default</option>
            )}
          </select>
        </label>
      </div>
      <dl className="model-settings__facts">
        <div>
          <dt>当前任务</dt>
          <dd>
            {runtimeProfile
              ? formatProfile(runtimeProfile, modelState.currentModelId)
              : "尚无活动任务"}
          </dd>
        </div>
        <div>
          <dt>新任务默认</dt>
          <dd>
            {formatProfile(defaultRuntimeProfile, modelState.currentModelId)}
          </dd>
        </div>
        <div>
          <dt>Context window</dt>
          <dd>
            {selectedModel?.totalContextTokens
              ? `${selectedModel.totalContextTokens.toLocaleString("en-US")} tokens`
              : "官方 Runtime 未提供"}
          </dd>
        </div>
      </dl>
      <div className="model-settings__notice" role="status">
        <Info size={16} />
        <span>
          {taskHasConversation
            ? "当前任务已有对话。为避免丢失 Runtime 上下文，本次保存只会成为后续新任务的默认值。"
            : canApplyToCurrent
              ? "当前任务尚无对话。保存后会创建新的 ACP 会话，使模型与推理强度立即生效。"
              : "可先保存为新任务默认值；完成登录并选择工作区后，Runtime 会在新任务启动时应用。"}
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
            ? "正在应用…"
            : canApplyToCurrent
              ? "保存并应用"
              : taskHasConversation
                ? "设为新任务默认"
                : "保存为新任务默认"}
        </button>
      </div>
    </div>
  );
}
