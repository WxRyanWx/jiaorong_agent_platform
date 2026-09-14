import { TENCENT_MEETING_MCP } from './tencentMeeting'

/**
 * 腾讯会议 MCP 工具中文点名。协议 id 仍用英文；仅此 server 用于列表/提及展示。
 * 前 18 个对齐官方说明文档「作用」；其余按 Skill 工具说明翻译。
 * https://meeting.tencent.com/support/topic/2233/index.html
 */
export const TENCENT_MEETING_TOOL_TITLES: Record<string, string> = {
  schedule_meeting: '创建会议（支持普通/周期性）',
  update_meeting: '修改会议（需二次确认）',
  cancel_meeting: '取消会议（需二次确认）',
  get_meeting: '用 meeting_id 查详情',
  get_meeting_by_code: '用会议号反查详情',
  get_meeting_participants: '查实际参会人明细',
  get_meeting_invitees: '查受邀人名单',
  get_waiting_room: '查等候室里有谁',
  get_user_meetings: '查即将开始/进行中的会议',
  get_user_ended_meetings: '查已结束的会议',
  get_records_list: '查录制列表',
  get_record_addresses: '拿录制下载地址',
  get_transcripts_paragraphs: '分页浏览转写段落',
  get_transcripts_details: '通过 pid 拿转写全文',
  search_transcripts: '在转写中搜关键词',
  get_smart_minutes: '拿 AI 智能纪要',
  convert_timestamp: '时间转换 / 相对时间换算',
  check_skill_version: '检查 Skill 版本',
  export_participants: '导出参会成员统计',
  get_job_result: '查询导出任务结果',
  manage_waiting_room: '管理等候室成员',
  search_meetings: '搜索会议',
  search_records: '搜索录制',
  search_minutes: '搜索元宝纪要',
  get_minutes: '查元宝纪要',
  apply_record_permission_prepare: '预览录制权限申请',
  apply_record_permission_commit: '提交录制权限申请',
  contact_search: '按姓名搜通讯录',
  contact_lookup_by_phone: '按手机号查通讯录',
  contact_lookup_by_email: '按邮箱查通讯录',
  meeting_invitees_add: '添加受邀人',
  meeting_invitees_remove: '移除受邀人',
  meeting_invitees_replace: '替换受邀人',
  meeting_control_call: '会中呼叫入会',
  meeting_control_kick: '会中踢出成员',
  submit_feedback: '提交反馈',
  get_skill_update_preference: '查询版本更新偏好',
  set_skill_update_preference: '设置版本更新偏好'
}

export function overlayTencentMeetingToolPresentation(
  serverName: string,
  toolName: string,
  current: { title: string; description: string }
): { title: string; description: string } {
  if (serverName !== TENCENT_MEETING_MCP.name) {
    return current
  }
  const shortTitle = TENCENT_MEETING_TOOL_TITLES[toolName]
  return {
    title: shortTitle ? `${TENCENT_MEETING_MCP.displayName}-${shortTitle}` : current.title,
    description: current.description
  }
}
