export type RelayErrorCopy = {
  title: string;
  hint: string;
  sticky: boolean;
};

/** Operator-facing copy for relay `protocol.error` codes (OVER-07). */
export const RELAY_ERROR_COPY: Record<string, RelayErrorCopy> = {
  not_in_space: {
    title: "当前会话不在该空间",
    hint: "请确认已加入正确的空间，或重新执行加入流程。",
    sticky: true,
  },
  no_orchestrator: {
    title: "未指定编排者，消息无法路由",
    hint: "请由空间所有者指定编排会话，或等待编排者上线后再试。",
    sticky: false,
  },
  orchestrator_offline: {
    title: "编排者已离线",
    hint: "暂时无法投递到编排者；请等待其恢复或更换编排者。",
    sticky: false,
  },
  invalid_envelope: {
    title: "信封格式无效",
    hint: "请检查客户端版本是否与 relay 一致，或刷新页面后重试。",
    sticky: false,
  },
  invalid_handshake: {
    title: "握手消息无效",
    hint: "请刷新页面并确认 relay 地址与版本配置正确。",
    sticky: false,
  },
  invalid_json: {
    title: "收到无效的 JSON",
    hint: "连接可能损坏；请刷新页面或检查中间代理是否改写流量。",
    sticky: false,
  },
  invalid_session_message: {
    title: "会话消息无效",
    hint: "请刷新页面后重新注册或恢复会话。",
    sticky: false,
  },
  resume_rejected: {
    title: "会话恢复被拒绝",
    hint: "凭据可能已失效；请清除本地会话后重新注册并加入空间。",
    sticky: true,
  },
  envelope_version_mismatch: {
    title: "信封协议版本不兼容",
    hint: "请刷新页面以加载与 relay 匹配的仪表盘版本。",
    sticky: true,
  },
  session_mismatch: {
    title: "会话与信封不一致",
    hint: "请刷新页面并重新加入空间，避免使用过期会话发送。",
    sticky: true,
  },
  expected_session_register_or_resume: {
    title: "需要先注册或恢复会话",
    hint: "在发送业务消息前，请先完成 session.register 或 session.resume。",
    sticky: true,
  },
  not_space_owner: {
    title: "仅空间所有者可执行此操作",
    hint: "请联系空间所有者代为执行，或切换到所有者会话。",
    sticky: false,
  },
  orchestrator_designate_forbidden: {
    title: "无权指定编排者",
    hint: "只有空间所有者可指定编排者；请确认当前会话身份。",
    sticky: false,
  },
  orchestrator_target_invalid: {
    title: "编排目标无效",
    hint: "所选会话不在空间内或不可作为编排者；请更换目标。",
    sticky: false,
  },
  task_assign_forbidden: {
    title: "无权分配任务",
    hint: "请确认由编排者发起任务分配，或检查协作权限配置。",
    sticky: false,
  },
  metadata_patch_forbidden: {
    title: "无权更新元数据",
    hint: "仅允许更新自身元数据，或需要编排者/所有者权限。",
    sticky: false,
  },
  idempotency_replay_mismatch: {
    title: "幂等重放不一致",
    hint: "同一幂等键对应了不同载荷；请更换幂等键或避免重复发送冲突请求。",
    sticky: false,
  },
  invalid_slug: {
    title: "空间标识（slug）无效",
    hint: "请检查加入的空间名称是否正确，或联系管理员确认 slug。",
    sticky: false,
  },
  already_in_space: {
    title: "已在该空间中",
    hint: "无需重复加入；若状态异常可刷新页面后重试。",
    sticky: false,
  },
};

export function getRelayErrorCopy(code: string): RelayErrorCopy {
  const row = RELAY_ERROR_COPY[code];
  if (row !== undefined) {
    return row;
  }
  return {
    title: `未知错误: ${code}`,
    hint: "请查看 relay 日志或刷新页面。",
    sticky: false,
  };
}
