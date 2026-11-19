/**
 * IICP Kanban — browser half (team kanban for DSH).
 *
 * Hand-written DSH client plugin bundle: a full-page "team task board" with
 * kanban columns, team member management and project grouping. Talks to the
 * host half through /iicp-kanban/api/* (owner-only). No build step or
 * third-party deps beyond React provided by DSH.
 */
window.__ModuleLoader__.load({
  id: "dsh-iicp-kanban",
  factory: (require) => {
    const React = require("react");

    const API_PREFIX = "/iicp-kanban/api";
    const PANEL_ID = "iicp-kanban";

    /* ---------------- locale ---------------- */
    let localeService = null;
    const activeLanguage =
      () =>
        localeService?.getSnapshot?.()?.active ||
        (typeof document !== "undefined" ? document.documentElement?.lang : "") ||
        "en";

    const EN_MESSAGES = Object.freeze({
      队长: "Lead",
      队长会话: "Lead session",
      与队长对话: "Chat with the lead",
      "给队长发消息…": "Message the lead…",
      发送: "Send",
      确认执行: "Approve plan",
      确认执行以上计划: "Approve the plan above and start dispatching",
      计划: "Plan",
      执行中: "Running",
      排队中: "Queued",
      会话不可用: "Session unavailable",
      会话: "Session",
      会话记录: "Session transcript",
      暂无会话记录: "No session transcript yet. This member has not run a session on any workspace.",
      加载中: "Loading…",
      已连接: "Connected",
      连接中: "Connecting…",
      重新连接: "Reconnect",
      队长正在思考: "The lead is working…",
      AI会话不可用: "The lead session is unavailable: this Host does not expose the agents service. Tasks can still be assigned manually.",
      "告诉队长要做什么：它会先给计划，确认后再建卡派单。": "Tell the lead what to do: it proposes a plan first and creates cards only after you approve.",
      一体化智能协作平台: "Integrated Collaboration Platform",
      项目: "Projects",
      成员: "Members",
      看板: "Board",
      待办: "To do",
      进行中: "In progress",
      受阻: "Blocked",
      已完成: "Done",
      新建任务: "New task",
      新建项目: "New project",
      新建成员: "New member",
      新增成员: "Add member",
      指派给: "Assignee",
      未指派: "Unassigned",
      优先级: "Priority",
      全部: "All",
      保存: "Save",
      取消: "Cancel",
      关闭: "Close",
      删除: "Delete",
      编辑: "Edit",
      归档: "Archive",
      恢复: "Restore",
      名称: "Name",
      角色: "Role",
      职位: "Title",
      联系方式: "Contact",
      备注: "Notes",
      目标: "Goal",
      验收标准: "Acceptance criteria",
      子任务: "Subtasks",
      添加子任务: "Add a subtask",
      前置任务: "Prerequisites",
      等待前置: "Waiting on",
      仅看可开工: "Ready only",
      无前置任务: "No prerequisites",
      "暂无前置任务，随时可以开工": "No prerequisites — ready to start",
      "选择前置任务…": "Pick a prerequisite…",
      添加前置: "Add prerequisite",
      添加: "Add",
      移除前置: "Remove prerequisite",
      前置任务未完成: "Prerequisites unfinished",
      无法开工: "Cannot start yet",
      未知前置: "Unknown prerequisite",
      未知项目: "Unknown project",
      前置: "Prerequisite",
      交付物: "Artifacts",
      标签: "Tags",
      标题: "Title",
      到期日: "Due date",
      可选: "optional",
      "要做什么？": "What needs to be done?",
      "这项任务要实现什么？": "What should this task achieve?",
      "写下可检查的结果或验证步骤": "Write down checkable results or verification steps",
      "记录决策、背景或提醒": "Record decisions, context or reminders",
      未归属: "No project",
      "保存中…": "Saving…",
      保存失败: "Save failed",
      成员负载: "Workload",
      已归档: "Archived",
      团队协作看板: "Team kanban: members, assignment and projects",
      确认删除: "Delete this item?",
      加载失败: "Failed to load board state",
      刚刚: "just now",
      分钟前: "min ago",
      小时前: "h ago",
      天前: "d ago",
      进度: "Progress",
      已逾期: "Overdue",
      任务: "Task",
      任务概览: "Overview",
      任务详情: "Task details",
      关闭任务详情: "Close task details",
      返回: "Back",
      查看详情: "View details",
      打开编辑: "Open editor",
      "单击查看详情，双击编辑": "Click for details, double-click to edit",
      无: "None",
      暂无: "None yet",
      暂无子任务: "No subtasks",
      暂无交付物: "No artifacts",
      暂无历史: "No history",
      变更历史: "History",
      无项目: "No project",
      无指派: "Unassigned",
      无到期日: "No due date",
      手动: "Manual",
      创建时间: "Created",
      更新时间: "Updated",
      搜索任务: "Search tasks",
      筛选: "Filter",
      全部项目: "All projects",
      全部成员: "All members",
      未归入自建项目: "No project",
      全部标签: "All tags",
      含归档: "Archived",
      清空筛选: "Clear filters",
      来源: "Source",
      显示: "Showing",
      分页: "Pagination",
      上一页: "Previous page",
      下一页: "Next page",
      暂无任务: "No tasks",
      "暂无任务，拖拽卡片到这里": "No tasks yet — drag a card here",
      暂无受阻任务: "Nothing blocked",
      折叠已完成列: "Collapse the done column",
      在: "New in",
      新建: "New",
      置顶: "Pinned",
      置顶任务: "Pin task",
      取消置顶: "Unpin",
      已置顶: "Pinned",
      已取消置顶: "Unpinned",
      归档任务: "Archive task",
      恢复任务: "Restore task",
      已归档任务: "Archived task",
      已归档: "Archived",
      已恢复: "Restored",
      已删除任务: "Task deleted",
      删除任务: "Delete task",
      移至: "Move to",
      已移动到: "Moved to",
      移动失败: "Move failed",
      操作失败: "Action failed",
      来自: "From",
      "来自 AI 会话": "From an AI session",
      更多任务操作: "More task actions",
      导出: "Export",
      导出失败: "Export failed",
      看板加载失败: "Board failed to load",
      重试: "Retry",
      "后台会自动重连，也可以稍等几秒。": "It reconnects automatically — you can also wait a few seconds.",
      正在加载: "Loading",
      全部任务: "All tasks",
      项: "items",
      视图: "Views",
      "按 / 搜索，按 n 新建": "Press / to search, n for a new task",
      编辑项目: "Edit project",
      全部工作区: "All workspaces",
      工作区: "Workspace",
      工作区项目: "Workspace projects",
      "按 DSH 工作区自动生成": "Generated from DSH workspaces",
      自建项目: "Custom projects",
      "手动创建，可跨工作区": "Created by hand, can span workspaces",
      已归档项目: "Archived projects",
      项目已归档: "Project archived",
      项目已恢复: "Project restored",
      项目已删除: "Project deleted",
      "项目内任务会变为未归属": " its tasks will no longer belong to a project.",
      近期: "Recent",
      完成进度: "completion",
      暂无近期任务: "No recent tasks",
      项受阻: "blocked",
      项逾期: "overdue",
      项进行中: "in progress",
      到期: "Due",
      看板: "Board",
      不自动归入: "Do not auto-assign",
      关联工作区: "Workspace",
      不关联工作区: "No workspace",
      "归档后默认不在列表显示": "Hidden from lists by default once archived",
      已失效: "no longer available",
      "该工作区已不在 DSH 中，保存后会解除绑定": "This workspace is no longer known to DSH. Saving will clear the binding.",
      "项目已被其他窗口修改，请刷新后重试": "This project was changed in another window. Refresh and try again.",
      "该工作区已指定其他项目": "This workspace is already assigned to another project",
      要给这个项目起个名字: "Name this project",
      "这个项目要解决什么问题、验收标准是什么": "What does this project solve, and what counts as done?",
      "工作区来自 DSH 的工作目录，会自动出现；自建项目由你创建，可以把不同工作区的任务归到一起。":
        "Workspace projects come from your DSH working directories. Custom projects are yours to create and can group tasks across workspaces.",
      "还没有自建项目。点右上角「新建项目」把一个或多个工作区的任务归到一起。":
        "No custom projects yet. Use “New project” in the top-right to group tasks across workspaces.",
      队长: "Lead",
      团队: "Team",
      团队总览: "Team overview",
      任务总监: "Task director",
      任务总数: "Total tasks",
      工作成员: "Workers",
      做的人不验收: "The doer never signs off",
      成员状态: "Status",
      待验收: "Awaiting review",
      暂无待验收: "Nothing awaiting review",
      全部处理完了: "All caught up",
      人格: "Personality",
      技能: "Skills",
      提供方: "Provider",
      模型: "Model",
      继承工作区: "Inherit workspace",
      跟随工作区默认模型: "Follows the workspace default model",
      正在读取模型目录: "Reading the model directory…",
      模型目录不可用: "Model directory unavailable",
      模型目录不可用可手填: "The model directory is unavailable — type the ids instead",
      该提供方没有可用模型: "This provider has no models",
      当前值不在目录里: "current value is not in the directory",
      会话: "Session",
      自动: "Auto",
      空闲: "Idle",
      待命: "Idle",
      工作中: "Working",
      受阻中: "Blocked",
      派单: "Assign task",
      "派单给 {0}": "Assign a task to {0}",
      选择任务: "Pick a task",
      没有可派单的任务: "No unassigned tasks to dispatch",
      已派单: "Task assigned",
      验收: "Review",
      "验收：{0}": "Review: {0}",
      通过: "Accept",
      返工: "Request changes",
      通过并标为完成: "Accept and mark done",
      要求返工: "Request changes",
      验收说明: "Review note",
      "写下通过的理由或要改的地方": "Say why it passes, or what must change",
      已通过: "Accepted",
      已返工: "Sent back",
      门下: "reports",
      成员: "Members",
      暂无成员: "No members",
      "还没有工作成员。点「新建成员」即可加入团队，新成员自动挂到队长名下。":
        "No workers yet. Use “New member” to add one — new members join under the lead automatically.",
      任务数: "Tasks",
      进行中数: "In progress",
      受阻数: "Blocked",
      "技能用逗号分隔，最多 8 个": "Comma-separated skills, up to 8",
      "这个成员擅长什么、验收要盯什么": "What this member is good at, and what to check in their work",
    });

    function createTranslator(catalog, language = "en") {
      return function translate(source, values = []) {
        const active = typeof language === "function" ? language() : language;
        const chinese = /^zh(?:-|$)/i.test(String(active || ""));
        const message = !chinese && Object.hasOwn(catalog, source) ? catalog[source] : source;
        return message.replace(/\{(\d+)\}/g, (token, index) =>
          Object.hasOwn(values, index) ? String(values[index]) : token,
        );
      };
    }
    const t = createTranslator(EN_MESSAGES, activeLanguage);

    /* ---------------- host API ---------------- */
    async function api(path, options = {}) {
      const response = await fetch(`${API_PREFIX}${path}`, {
        credentials: "same-origin",
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        ...options,
      });
      const payload = await response.json().catch(() => ({ ok: false, error: "bad-json" }));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
      }
      return payload;
    }

    /* ---------------- styles ---------------- */
    function ensureStyle() {
      const existing = document.getElementById("iicp-kanban-style");
      if (existing) return existing;
      const tag = document.createElement("style");
      tag.id = "iicp-kanban-style";
      tag.textContent = `
/* tokens（与 dsh-super-kanban v3 同源：DSH-native 单色设计令牌） */
.iicp-board{--iicp-line:var(--dsw-alias-border-l2,rgba(0,0,0,.10));--iicp-line-soft:var(--dsw-alias-border-l1,rgba(0,0,0,.045));--iicp-line-strong:var(--dsw-alias-border-l3,rgba(0,0,0,.12));--iicp-surface:var(--dsw-alias-bg-layer-1,#fff);--iicp-ink:var(--dsw-alias-label-primary,#0f1115);--iicp-ink-2:var(--dsw-alias-label-secondary,#61666b);--iicp-ink-3:var(--dsw-alias-label-tertiary,#81858c);--iicp-ink-4:var(--dsw-alias-label-caption,#adb2b8);--iicp-accent:var(--dsw-alias-state-business-primary,#4176e6);--iicp-red:var(--dsw-alias-state-error-primary,#ec1313);--iicp-amber:var(--dsw-alias-state-warn-primary,#f59e0b);--iicp-hover:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));--iicp-mask:color-mix(in srgb,var(--dsw-alias-bg-mask-3,#0000007a) 26%,transparent);box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;color:var(--iicp-ink);background:var(--dsw-alias-bg-base,#fff);font-family:var(--dsh-font-family-text-default,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif);font-size:13px;line-height:1.45;padding:calc(var(--dsh-frame-top-clearance,0px) + 24px) 28px 20px}
.iicp-board *,.iicp-board *::before,.iicp-board *::after{box-sizing:border-box}
.iicp-board button,.iicp-board input,.iicp-board textarea,.iicp-board select{font-family:inherit}
.iicp-board ::-webkit-scrollbar{width:6px;height:6px}
.iicp-board ::-webkit-scrollbar-thumb{background:var(--dsh-scrollbar-thumb,var(--dsw-alias-scrollbar-bg-l1,#e5e5e5));border-radius:99px}
.iicp-board ::-webkit-scrollbar-track{background:transparent}
.iicp-board :focus-visible{outline:2px solid color-mix(in srgb,var(--iicp-accent) 55%,transparent);outline-offset:2px}
/* header（v3：20px/500 标题 + 弱化统计行 + 右侧操作区） */
.iicp-header{flex:none;display:flex;align-items:flex-start;gap:16px;min-width:0;padding:0 0 12px}
.iicp-header-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.iicp-title{margin:0;font-size:20px;font-weight:500;line-height:1.25;color:var(--iicp-ink);white-space:nowrap}
.iicp-stats-line{display:flex;align-items:center;gap:10px;margin:0;min-width:0;overflow:hidden;white-space:nowrap;font-size:12px;font-weight:400;line-height:1.4;color:var(--iicp-ink-2)}
.iicp-stats-total{flex:none;font-variant-numeric:tabular-nums}
.iicp-stats-group{display:inline-flex;align-items:center;gap:5px}
.iicp-stats-group .iicp-dot{margin-top:0}
.iicp-header-actions{flex:none;display:flex;align-items:center;gap:8px;min-width:0}
.iicp-search{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;width:200px;border:0.5px solid var(--iicp-line);border-radius:8px;background:transparent;color:var(--iicp-ink);transition:border-color .15s,background .1s}
.iicp-search:focus-within{border-color:var(--iicp-line-strong);background:color-mix(in srgb,var(--iicp-ink) 3%,transparent)}
.iicp-search svg{flex:none;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-search input{border:none;outline:none;background:transparent;color:var(--iicp-ink);font:inherit;font-size:12px;width:100%;min-width:0}
.iicp-search input::placeholder{color:color-mix(in srgb,var(--iicp-ink) 40%,transparent)}
.iicp-search input::-webkit-search-cancel-button{display:none}
/* buttons（v3：32px 高 / 8px 圆角 / 0.5px 边框，主按钮走 DSH primary-fill 令牌） */
.iicp-btn{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:32px;border:0.5px solid var(--iicp-line);background:transparent;color:var(--iicp-ink);border-radius:8px;padding:0 12px;font-size:12px;font-weight:500;line-height:1;white-space:nowrap;transition:background .15s,border-color .15s}
.iicp-btn:hover{background:color-mix(in srgb,var(--iicp-ink) 5%,transparent);border-color:var(--iicp-line-strong)}
.iicp-btn:disabled{opacity:.45;cursor:default}
.iicp-btn.primary{background:var(--dsw-alias-button-primary-fill,#0f1115);color:var(--dsw-alias-label-primary-foreground,#fff);border-color:transparent}
.iicp-btn.primary:hover{background:var(--dsw-alias-button-primary-hover,#43454a)}
.iicp-btn.seg{border-color:transparent;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent)}
.iicp-btn.seg:hover{background:color-mix(in srgb,var(--iicp-ink) 5%,transparent);border-color:transparent;color:var(--iicp-ink)}
.iicp-btn.seg.on{background:color-mix(in srgb,var(--iicp-ink) 8%,transparent);color:var(--iicp-ink);font-weight:500}
.iicp-btn.on{background:color-mix(in srgb,var(--iicp-ink) 8%,transparent);border-color:var(--iicp-line-strong)}
.iicp-btn.danger{color:var(--iicp-red);border-color:color-mix(in srgb,var(--iicp-red) 30%,transparent)}
.iicp-btn.danger:hover{background:color-mix(in srgb,var(--iicp-red) 8%,transparent);border-color:color-mix(in srgb,var(--iicp-red) 30%,transparent)}
/* views */
.iicp-view{flex:1;min-height:0;overflow:auto;padding:10px 0 0;display:flex;flex-direction:column}
.iicp-stats{display:flex;gap:10px;font-size:12px;color:var(--iicp-ink-2);white-space:nowrap}
/* slimbar（v3：视图切换 + 范围选择 + 计数 + 筛选） */
.iicp-slimbar{display:flex;align-items:center;gap:6px;flex:none;min-width:0;padding:0 0 7px;margin:0 0 6px;border-bottom:0.5px solid var(--iicp-line-soft);flex-wrap:wrap}
.iicp-slimbar-spacer{flex:1;min-width:4px}
.iicp-view-switch{flex:none;display:inline-flex;gap:2px;padding:2px;border:0.5px solid var(--iicp-line);border-radius:8px;background:var(--iicp-surface)}
.iicp-view-switch button{border:0;background:none;color:var(--iicp-ink-2);font:inherit;font-size:12px;min-height:28px;padding:4px 8px;border-radius:5px;cursor:pointer;white-space:nowrap}
.iicp-view-switch button[aria-pressed="true"]{background:color-mix(in srgb,var(--iicp-ink) 8%,transparent);color:var(--iicp-ink);font-weight:500}
.iicp-view-switch button:hover{background:color-mix(in srgb,var(--iicp-ink) 5%,transparent)}
.iicp-count{flex:none;font-size:11px;color:var(--iicp-ink-4);white-space:nowrap;font-variant-numeric:tabular-nums}
.iicp-count b{color:var(--iicp-ink-3);font-weight:600}
.iicp-filter-wrap{position:relative;flex:none}
.iicp-filter-count{margin-left:2px;font-size:10px;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent)}
.iicp-popover{position:absolute;top:calc(100% + 6px);right:0;z-index:45;width:min(272px,calc(100vw - 24px));padding:10px;display:flex;flex-direction:column;gap:8px;border-radius:10px;background:var(--iicp-surface);border:0.5px solid var(--iicp-line-strong);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.16))}
.iicp-pop-row{display:flex;flex-direction:column;gap:4px}
.iicp-pop-label{font-size:11px;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-pop-chips{display:flex;flex-wrap:wrap;gap:2px}
.iicp-popover .iicp-select,.iicp-pop-row select{appearance:none;height:28px;border:0.5px solid var(--iicp-line);background:var(--iicp-surface);color:var(--iicp-ink);border-radius:8px;padding:0 22px 0 9px;font:inherit;font-size:12px;background-image:linear-gradient(45deg,transparent 50%,var(--iicp-ink-4) 50%),linear-gradient(135deg,var(--iicp-ink-4) 50%,transparent 50%);background-position:calc(100% - 11px) 52%,calc(100% - 7px) 52%;background-size:4px 4px,4px 4px;background-repeat:no-repeat;cursor:pointer}
.iicp-pop-foot{display:flex;align-items:center;justify-content:space-between;gap:4px;border-top:0.5px solid var(--iicp-line-soft);padding-top:6px}
.iicp-chip{cursor:pointer;display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:color-mix(in srgb,var(--iicp-ink) 62%,transparent);font:inherit;font-size:12px;white-space:nowrap}
.iicp-chip:hover{background:color-mix(in srgb,var(--iicp-ink) 6%,transparent);color:var(--iicp-ink)}
.iicp-chip.on{background:color-mix(in srgb,var(--iicp-ink) 8%,transparent);color:var(--iicp-ink);font-weight:500}
.iicp-clear{font-size:12px;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent);background:none;border:none;padding:0;cursor:pointer}
.iicp-clear:hover{color:var(--iicp-ink);text-decoration:underline}
/* board（v3：无框列 + 0.5px 下划线列头，拖拽高亮走 outline） */
.iicp-columns{flex:1;min-height:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.iicp-column{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:visible}
.iicp-column.is-collapsed{flex:none;border-right:0.5px solid var(--iicp-line-soft);padding-right:7px}
.iicp-column-head{display:flex;align-items:center;gap:6px;padding:0 2px 8px;border-bottom:0.5px solid var(--iicp-line-soft);margin-bottom:10px;flex:none}
.iicp-col-title{font-size:12px;font-weight:600;color:var(--iicp-ink)}
.iicp-column-head .iicp-dot{margin-top:0}
.iicp-column-count{background:none;border:none;padding:0;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent);font-size:11px;font-variant-numeric:tabular-nums}
.iicp-col-spacer{flex:1}
.iicp-col-toggle{display:inline-flex;align-items:center;gap:6px;min-height:22px;padding:0 3px;border:0;border-radius:5px;background:none;color:var(--iicp-ink-2);font:inherit;cursor:pointer;white-space:nowrap}
.iicp-col-toggle:hover{background:color-mix(in srgb,var(--iicp-ink) 5%,transparent);color:var(--iicp-ink)}
.iicp-col-toggle.is-icon{width:22px;height:22px;justify-content:center;padding:0;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent);opacity:0;transition:opacity .15s,background .15s}
.iicp-column:hover .iicp-col-toggle.is-icon,.iicp-col-toggle.is-icon:focus-visible{opacity:1}
.iicp-col-toggle svg{transition:transform .15s}
.iicp-col-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}
.iicp-col-add{display:grid;place-items:center;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:none;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent);cursor:pointer;opacity:0;transition:opacity .15s,background .15s,color .15s}
.iicp-column:hover .iicp-col-add,.iicp-col-add:focus-visible{opacity:1}
.iicp-col-add:hover{background:color-mix(in srgb,var(--iicp-ink) 6%,transparent);color:var(--iicp-ink)}
.iicp-column.dragover .iicp-column-head{border-bottom-color:var(--iicp-ink)}
.iicp-column.dragover .iicp-cards{outline:1px solid var(--iicp-line-strong);outline-offset:4px;border-radius:8px}
.iicp-cards{flex:1;min-height:0;overflow-y:auto;padding:0 2px 14px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;overscroll-behavior-y:contain}
.iicp-cards>.iicp-card{flex:none}
.iicp-pager{display:flex;flex:none;align-items:center;justify-content:center;gap:8px;min-height:28px;border-top:0.5px solid var(--iicp-line-soft);color:var(--iicp-ink-2);font-size:11px;font-variant-numeric:tabular-nums}
.iicp-pager button{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:5px;background:none;color:inherit;cursor:pointer}
.iicp-pager button:hover:not(:disabled){background:var(--iicp-hover);color:var(--iicp-ink)}
.iicp-pager button:disabled{opacity:.35;cursor:default}
.iicp-pager button:nth-of-type(2)>svg{transform:rotate(180deg)}
/* card menu（固定定位浮层） */
.iicp-menu{position:fixed;z-index:99;min-width:184px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:4px;border-radius:10px;background:var(--iicp-surface);border:0.5px solid var(--iicp-line-strong);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.18))}
.iicp-menu-item{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 10px;border:none;border-radius:6px;background:transparent;color:var(--iicp-ink);font:inherit;font-size:12px;text-align:left;cursor:pointer;white-space:nowrap}
.iicp-menu-item:hover{background:color-mix(in srgb,var(--iicp-ink) 6%,transparent)}
.iicp-menu-item.is-danger{color:var(--iicp-red)}
.iicp-menu-sep{height:0.5px;margin:4px 6px;background:var(--iicp-line-soft)}
/* loading / error / toast */
.iicp-loading{flex:1;display:flex;flex-direction:column;gap:10px;padding:18px 2px}
.iicp-loading-line{height:12px;border-radius:6px;background:color-mix(in srgb,var(--iicp-ink) 6%,transparent);animation:iicpPulse 1.5s ease-in-out infinite}
.iicp-loading-line:nth-child(2){width:70%}
.iicp-loading-line:nth-child(3){width:45%}
@keyframes iicpPulse{0%,100%{opacity:.55}50%{opacity:1}}
.iicp-empty-state{flex:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:8px;padding:40px 2px;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent);font-size:13px}
.iicp-error-title{margin:0;font-size:13px;font-weight:600;color:var(--iicp-ink)}
.iicp-error-detail{margin:0;font-size:12px;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent);word-break:break-word}
.iicp-toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1200;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.iicp-toast{padding:7px 14px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#1f2126);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:12px;line-height:1.4;box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.2));animation:iicpFade .15s ease}
/* cards（对齐 dsh-super-kanban v3 卡片：状态点 + 两行标题 + 弱化 meta + 状态色进度线） */
.iicp-card{border:0.5px solid var(--iicp-line);border-radius:12px;background:var(--iicp-surface);padding:11px 14px 10px;display:flex;flex-direction:column;gap:6px;cursor:grab;box-shadow:none;transform:none;transition:border-color .15s,background .15s}
.iicp-card:hover{border-color:var(--iicp-line-strong)}
.iicp-card:active{cursor:grabbing}
.iicp-card.dragging{opacity:.4;box-shadow:none}
.iicp-card:focus-visible{outline:1px solid var(--iicp-line-strong);outline-offset:2px}
.iicp-card-head{display:flex;align-items:flex-start;gap:7px;min-width:0}
.iicp-dot{width:6px;height:6px;border-radius:50%;flex:none;display:inline-block;margin-top:6px}
.iicp-dot.is-backlog{background:color-mix(in srgb,var(--iicp-ink) 40%,transparent)}
.iicp-dot.is-in_progress{background:var(--iicp-accent)}
.iicp-dot.is-blocked{background:var(--iicp-amber)}
.iicp-dot.is-done{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 55%,transparent)}
.iicp-card-title{margin:0;font-size:13px;font-weight:600;line-height:1.4;color:var(--iicp-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;flex:1;min-width:0}
.iicp-card-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;row-gap:3px;min-width:0;font-size:11px;line-height:1.4;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-card-scope{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.iicp-card-sep{flex:none;color:color-mix(in srgb,var(--iicp-ink) 30%,transparent)}
.iicp-card-time{flex:none;white-space:nowrap}
.iicp-card-metrics{margin-left:auto;display:inline-flex;align-items:center;gap:7px;flex:none;font-size:11px;white-space:nowrap;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-prio{font-weight:500;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent)}
.iicp-prio.is-p0{color:var(--iicp-red)}
.iicp-prio.is-p1{color:var(--iicp-amber)}
.iicp-card-metric{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;color:inherit;max-width:96px;overflow:hidden;text-overflow:ellipsis}
.iicp-card-metric svg{flex:none;display:block}
.iicp-card-metric.is-done{color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 75%,transparent)}
.iicp-card-metric.is-waiting{max-width:none;color:color-mix(in srgb,var(--iicp-ink) 58%,transparent)}
.iicp-card-planning{display:flex;align-items:center;flex-wrap:wrap;gap:5px 10px;font-size:11px;line-height:1.4;color:var(--iicp-ink-2)}
.iicp-card-planning .iicp-due{flex:none}
.iicp-card-planning .iicp-due.is-overdue{color:var(--iicp-red);font-weight:500}
.iicp-card-planning .iicp-card-tags{display:inline-flex;gap:8px;flex-wrap:wrap;color:color-mix(in srgb,var(--iicp-ink) 40%,transparent);min-width:0}
.iicp-card-summary{font-size:12px;line-height:1.4;color:var(--iicp-ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.iicp-card-progress{height:3px;border-radius:1.5px;background:color-mix(in srgb,var(--iicp-ink) 10%,transparent);overflow:hidden;margin-top:2px;flex:none}
.iicp-card-progress i{display:block;height:100%;border-radius:1.5px;background:color-mix(in srgb,var(--iicp-ink) 20%,transparent);transition:width .3s}
.iicp-card.is-in_progress .iicp-card-progress i{background:color-mix(in srgb,var(--iicp-accent) 75%,transparent)}
.iicp-card.is-blocked .iicp-card-progress i{background:color-mix(in srgb,var(--iicp-amber) 75%,transparent)}
/* 完成卡：进度线隐藏、标题降权、指标让位（同 v3） */
.iicp-card.is-done .iicp-card-progress{display:none}
.iicp-card.is-done .iicp-card-title{font-weight:500}
.iicp-card.is-done .iicp-card-metrics{display:none}
.iicp-card-open{border:none;background:none;padding:0;margin:0;font:inherit;font-size:13px;font-weight:600;line-height:1.4;color:inherit;text-align:left;cursor:inherit;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.iicp-card.is-done .iicp-card-open{font-weight:500}
.iicp-card.is-archived{opacity:.65}
.iicp-card.is-pinned{border-color:color-mix(in srgb,var(--iicp-ink) 18%,transparent)}
.iicp-mark{flex:none;margin-top:4px;font-size:10px;line-height:1;color:var(--iicp-ink-3);background:color-mix(in srgb,var(--iicp-ink) 6%,transparent);border-radius:4px;padding:3px 5px;white-space:nowrap}
.iicp-ai-mark{flex:none;margin-top:4px;font-size:11px;line-height:1;font-weight:500;letter-spacing:.02em;white-space:nowrap;color:color-mix(in srgb,var(--iicp-accent) 65%,transparent)}
.iicp-card-menu{flex:none;display:grid;place-items:center;width:18px;height:18px;margin-top:2px;padding:0;border:none;border-radius:4px;background:transparent;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent);cursor:pointer;opacity:0;transition:opacity .15s,background .15s}
.iicp-card:hover .iicp-card-menu,.iicp-card-menu:focus-visible{opacity:1}
.iicp-card-menu:hover{background:color-mix(in srgb,var(--iicp-ink) 8%,transparent);color:var(--iicp-ink)}
.iicp-empty{color:color-mix(in srgb,var(--iicp-ink) 40%,transparent);font-size:12px;text-align:left;padding:10px 2px}
/* tables（v3：弱化表头 + 0.5px 行分隔） */
.iicp-table{width:100%;border-collapse:collapse}
.iicp-table th{text-align:left;padding:8px 10px;border-bottom:0.5px solid var(--iicp-line-soft);color:color-mix(in srgb,var(--iicp-ink) 45%,transparent);font-weight:400;font-size:11px}
.iicp-table td{text-align:left;padding:10px;border-bottom:0.5px solid var(--iicp-line-soft);color:var(--iicp-ink);font-size:13px}
/* projects（v2.6：工作区项目 / 自建项目 / 已归档 三段卡片墙，对齐 super-kanban sk-project-*） */
.iicp-projects{flex:1;min-height:0;overflow:auto;padding:14px 0 24px}
.iicp-projects-guide{margin:0 0 16px;max-width:720px;font-size:12px;line-height:1.6;color:var(--iicp-ink-3)}
.iicp-project-section{margin:0 0 20px}
.iicp-project-section>h3{display:flex;align-items:baseline;gap:8px;margin:0 0 9px;font-size:13px;font-weight:600;color:var(--iicp-ink-2)}
.iicp-project-section>h3 span{font-weight:400;font-size:11px;color:var(--iicp-ink-4)}
.iicp-project-grid{display:grid;align-items:start;grid-template-columns:repeat(auto-fill,minmax(min(100%,268px),1fr));gap:10px}
.iicp-project-card{display:grid;gap:9px;min-width:0;padding:13px;border:0.5px solid var(--iicp-line);border-radius:12px;background:var(--iicp-surface)}
.iicp-project-card.is-archived{opacity:.7}
.iicp-project-card h4,.iicp-project-card p{margin:0;overflow-wrap:anywhere}
.iicp-project-card h4{font-size:14px;font-weight:600;line-height:1.35}
.iicp-project-metrics{font-size:11px;line-height:1.5;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent)}
.iicp-project-progress{width:100%;height:5px;border-radius:3px;background:color-mix(in srgb,var(--iicp-ink) 10%,transparent);overflow:hidden}
.iicp-project-progress>i{display:block;height:100%;border-radius:3px;background:var(--iicp-accent);opacity:.75}
.iicp-project-due{font-size:11px;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent)}
.iicp-project-due.is-overdue{color:var(--iicp-red);font-weight:500}
.iicp-project-note{font-size:12px;line-height:1.5;max-height:5.4em;overflow:auto;color:var(--iicp-ink-2);white-space:pre-wrap}
.iicp-project-actions{display:flex;flex-wrap:wrap;gap:6px}
.iicp-project-actions .iicp-btn{height:26px;padding:0 9px;font-size:11px}
.iicp-project-empty{color:color-mix(in srgb,var(--iicp-ink) 40%,transparent);font-size:12px;padding:6px 0}
.iicp-archive-block{margin-top:8px}
.iicp-archive-block summary{cursor:pointer;font-size:13px;color:var(--iicp-ink-2)}
.iicp-archive-block[open] summary{margin-bottom:10px}
/* team（v0.3：队长卡片 + 工作成员卡片 + 待验收队列） */
.iicp-team{flex:1;min-height:0;overflow:auto;padding:14px 0 24px;display:flex;flex-direction:column;gap:18px}
.iicp-team-section{margin:0;display:flex;flex-direction:column;gap:9px}
.iicp-team-section>h3{display:flex;align-items:baseline;gap:8px;margin:0;font-size:13px;font-weight:600;color:var(--iicp-ink-2)}
.iicp-team-section>h3 span{font-weight:400;font-size:11px;color:var(--iicp-ink-4)}
.iicp-team-lead{display:grid;gap:9px;padding:14px;border:0.5px solid var(--iicp-line-strong);border-radius:12px;background:var(--iicp-surface);max-width:640px}
.iicp-team-lead-head{display:flex;align-items:flex-start;gap:10px;min-width:0}
.iicp-team-avatar{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;font-size:13px;font-weight:600;background:color-mix(in srgb,var(--iicp-ink) 7%,transparent);color:var(--iicp-ink-2)}
.iicp-team-lead .iicp-team-avatar{background:var(--dsw-alias-button-primary-fill,#0f1115);color:var(--dsw-alias-label-primary-foreground,#fff)}
.iicp-team-id{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.iicp-team-name{margin:0;font-size:14px;font-weight:600;line-height:1.35;color:var(--iicp-ink);overflow-wrap:anywhere}
.iicp-team-sub{font-size:11px;line-height:1.4;color:var(--iicp-ink-3);overflow-wrap:anywhere}
.iicp-team-crown{flex:none;font-size:10px;font-weight:500;color:var(--iicp-ink-3);border:0.5px solid var(--iicp-line);border-radius:5px;padding:2px 6px;white-space:nowrap}
.iicp-team-metrics{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--iicp-ink-3);font-variant-numeric:tabular-nums}
.iicp-team-metrics b{color:var(--iicp-ink-2);font-weight:600}
.iicp-team-bio{margin:0;font-size:12px;line-height:1.5;color:var(--iicp-ink-2);white-space:pre-wrap;overflow-wrap:anywhere}
.iicp-team-skills{display:flex;flex-wrap:wrap;gap:5px}
.iicp-team-skill{font-size:10px;line-height:1.6;color:var(--iicp-ink-3);border:0.5px solid var(--iicp-line-soft);border-radius:5px;padding:0 5px;white-space:nowrap}
.iicp-team-grid{display:grid;align-items:start;grid-template-columns:repeat(auto-fill,minmax(min(100%,252px),1fr));gap:10px}
.iicp-team-card{display:grid;gap:8px;min-width:0;padding:12px;border:0.5px solid var(--iicp-line);border-radius:12px;background:var(--iicp-surface)}
.iicp-team-card-head{display:flex;align-items:flex-start;gap:9px;min-width:0}
.iicp-team-card-head .iicp-team-avatar{width:28px;height:28px;font-size:12px}
.iicp-team-tag{flex:none;display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:500;line-height:1.6;border-radius:5px;padding:0 6px;white-space:nowrap;color:var(--iicp-ink-3);background:color-mix(in srgb,var(--iicp-ink) 5%,transparent)}
.iicp-team-tag.is-working{color:var(--iicp-accent);background:color-mix(in srgb,var(--iicp-accent) 10%,transparent)}
.iicp-team-tag.is-blocked{color:var(--iicp-amber);background:color-mix(in srgb,var(--iicp-amber) 12%,transparent)}
.iicp-team-tag.is-review{color:var(--iicp-red);background:color-mix(in srgb,var(--iicp-red) 10%,transparent)}
.iicp-team-card-actions{display:flex;flex-wrap:wrap;gap:6px}
.iicp-team-card-actions .iicp-btn{height:26px;padding:0 9px;font-size:11px}
.iicp-team-empty{color:color-mix(in srgb,var(--iicp-ink) 40%,transparent);font-size:12px;padding:6px 0;line-height:1.6}
.iicp-review-list{display:flex;flex-direction:column;gap:8px}
.iicp-review-row{display:grid;gap:7px;padding:11px 12px;border:0.5px solid var(--iicp-line);border-radius:10px;background:var(--iicp-surface)}
.iicp-review-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}
.iicp-review-title{font-size:13px;font-weight:600;color:var(--iicp-ink);overflow-wrap:anywhere;min-width:0}
.iicp-review-by{font-size:11px;color:var(--iicp-ink-3)}
.iicp-review-note{margin:0;font-size:12px;line-height:1.5;color:var(--iicp-ink-2);overflow-wrap:anywhere;white-space:pre-wrap}
.iicp-review-actions{display:flex;flex-wrap:wrap;gap:6px}
.iicp-team-banner{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:10px;font-size:12px;line-height:1.5;border:0.5px solid color-mix(in srgb,var(--iicp-amber) 35%,transparent);background:color-mix(in srgb,var(--iicp-amber) 7%,transparent);color:var(--iicp-ink-2)}
.iicp-team-row-name{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow-wrap:anywhere}
.iicp-team-hint{margin:0;font-size:11px;line-height:1.5;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
/* modal（v3：16px 圆角 / 0.5px 边框 / 面板阴影，body 内部滚动避免按钮出视口） */
.iicp-modal-backdrop{position:fixed;inset:0;background:var(--iicp-mask);display:flex;align-items:center;justify-content:center;z-index:1000}
.iicp-modal{display:flex;flex-direction:column;width:min(520px,92vw);max-height:84vh;overflow:hidden;background:var(--iicp-surface);color:var(--iicp-ink);border:0.5px solid var(--iicp-line-strong);border-radius:16px;box-shadow:var(--dsw-elevation-panel,0 8px 28px rgba(0,0,0,.16));padding:20px;gap:14px}
.iicp-modal h2{margin:0;font-size:15px;font-weight:600}
.iicp-modal-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin}
.iicp-field{display:flex;flex-direction:column;gap:5px}
.iicp-field label{font-size:11px;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-field input,.iicp-field select,.iicp-field textarea{box-sizing:border-box;width:100%;height:32px;border:0.5px solid var(--iicp-line);border-radius:8px;background:var(--iicp-surface);color:var(--iicp-ink);padding:0 10px;font:inherit;font-size:12px}
.iicp-field textarea{height:auto;min-height:60px;resize:vertical;padding:8px 10px;line-height:1.55}
.iicp-field input:focus,.iicp-field select:focus,.iicp-field textarea:focus{outline:none;border-color:color-mix(in srgb,var(--iicp-accent) 55%,var(--iicp-line));box-shadow:0 0 0 3px color-mix(in srgb,var(--iicp-accent) 11%,transparent)}
.iicp-field input[type="checkbox"]{width:auto;height:auto;padding:0;border:none;background:none;box-shadow:none;flex:none}
.iicp-field input[type="checkbox"]:focus{box-shadow:none}
.iicp-subtask-add input[type="text"]{width:auto}
.iicp-field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.iicp-field-row .iicp-field{min-width:0}
.iicp-check{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--iicp-ink-2);cursor:pointer}
.iicp-check input[type="checkbox"]{width:14px;height:14px;margin:0;accent-color:var(--iicp-accent);flex:none}
/* subtask / artifact lists inside the task modal */
.iicp-subtask-list{display:flex;flex-direction:column;gap:4px}
.iicp-subtask{display:flex;align-items:center;gap:8px;padding:2px 0}
.iicp-subtask input[type="checkbox"]{accent-color:var(--iicp-accent);flex:none}
.iicp-subtask-text{flex:1;min-width:0;font-size:12px;color:var(--iicp-ink);word-break:break-word}
.iicp-subtask-text.done{color:color-mix(in srgb,var(--iicp-ink) 40%,transparent);text-decoration:line-through}
.iicp-subtask-src{font-size:10px;color:var(--iicp-ink-4);border:0.5px solid var(--iicp-line-soft);border-radius:4px;padding:0 4px;flex:none}
.iicp-subtask-del{border:none;background:none;color:var(--iicp-ink-3);font-size:14px;cursor:pointer;padding:0 4px;flex:none}
.iicp-subtask-del:hover{color:var(--iicp-red)}
.iicp-subtask-add{display:flex;gap:6px;margin-top:2px}
.iicp-subtask-add input{flex:1;min-width:0;height:28px;border:0.5px solid var(--iicp-line);border-radius:8px;background:var(--iicp-surface);color:var(--iicp-ink);padding:0 10px;font:inherit;font-size:12px}
.iicp-subtask-add input:focus{outline:none;border-color:color-mix(in srgb,var(--iicp-accent) 55%,var(--iicp-line))}
.iicp-subtask-add .iicp-btn{height:28px;padding:0 10px}
.iicp-modal-actions{display:flex;gap:8px;justify-content:flex-end;flex:none;padding-top:8px;border-top:0.5px solid var(--iicp-line-soft)}
/* filters（v3 sk-select 同款：无边背景 + 自绘箭头） */
.iicp-filter{display:flex;align-items:center;gap:6px;font-size:12px;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent)}
.iicp-filter-label{white-space:nowrap;font-size:11px;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-filter select{appearance:none;height:28px;border:0.5px solid var(--iicp-line);background:var(--iicp-surface);color:var(--iicp-ink);border-radius:8px;padding:0 22px 0 9px;font:inherit;font-size:12px;background-image:linear-gradient(45deg,transparent 50%,var(--iicp-ink-4) 50%),linear-gradient(135deg,var(--iicp-ink-4) 50%,transparent 50%);background-position:calc(100% - 11px) 52%,calc(100% - 7px) 52%;background-size:4px 4px,4px 4px;background-repeat:no-repeat}
.iicp-filter select:hover{background-color:color-mix(in srgb,var(--iicp-ink) 4%,transparent)}
/* seg button groups (state / priority), super-kanban sk-seg style */
.iicp-seg{display:flex;gap:4px}
.iicp-seg button{flex:1;min-width:0;height:28px;padding:0 8px;border:0.5px solid var(--iicp-line);border-radius:8px;background:var(--iicp-surface);color:color-mix(in srgb,var(--iicp-ink) 62%,transparent);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.iicp-seg button:hover{background-color:color-mix(in srgb,var(--iicp-ink) 5%,transparent)}
.iicp-seg button.on{background:color-mix(in srgb,var(--iicp-ink) 8%,transparent);border-color:var(--iicp-line-strong);color:var(--iicp-ink);font-weight:500}
/* planning fold（项目/到期日/备注 折叠区） */
.iicp-planning{border:0.5px solid var(--iicp-line-soft);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
.iicp-planning summary{cursor:pointer;font-size:12px;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent);user-select:none}
.iicp-planning[open] summary{padding-bottom:2px}
/* overdue due date */
.iicp-pill.overdue{color:var(--iicp-red);font-weight:500}
/* ---------- task detail drawer（对齐 dsh-super-kanban v3 TaskDrawer：右侧抽屉 + 分节） ---------- */
.iicp-mask{position:fixed;inset:0;background:var(--iicp-mask);z-index:60;animation:iicpFade .15s ease}
.iicp-drawer{position:fixed;top:0;right:0;bottom:0;width:min(540px,94vw);z-index:61;display:flex;flex-direction:column;background:var(--iicp-surface);border-left:0.5px solid var(--iicp-line-strong);overflow:hidden;animation:iicpSlideIn .2s cubic-bezier(.22,.7,.3,1)}
@keyframes iicpFade{from{opacity:0}to{opacity:1}}
@keyframes iicpSlideIn{from{transform:translateX(14px);opacity:.55}to{transform:none;opacity:1}}
.iicp-drawer-head{flex:none;display:flex;align-items:flex-start;gap:8px;padding:calc(var(--dsh-frame-top-clearance,0px) + 12px) 16px 12px 10px;min-height:48px;border-bottom:0.5px solid var(--iicp-line-soft);background:var(--iicp-surface)}
.iicp-drawer-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.iicp-drawer-kicker{font-size:11px;line-height:1.3;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-drawer-title{margin:0;font-size:15px;font-weight:600;line-height:1.35;color:var(--iicp-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.iicp-iconbtn{flex:none;width:28px;height:28px;display:grid;place-items:center;border:none;border-radius:8px;background:transparent;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent);cursor:pointer;padding:0}
.iicp-iconbtn:hover{background:color-mix(in srgb,var(--iicp-ink) 6%,transparent);color:var(--iicp-ink)}
.iicp-drawer-body{flex:1;min-height:0;overflow-y:auto;padding:0 20px 20px;display:flex;flex-direction:column;scrollbar-width:thin}
.iicp-drawer-sec{padding:16px 0;border-bottom:0.5px solid var(--iicp-line-soft);display:flex;flex-direction:column;gap:8px;min-width:0}
.iicp-drawer-sec:last-of-type{border-bottom:none}
.iicp-drawer-sec-head{display:flex;align-items:center;gap:8px;min-height:18px}
.iicp-drawer-sec-title{font-size:12px;font-weight:600;color:var(--iicp-ink-3)}
.iicp-drawer-sec-count{margin-left:auto;font-size:11px;color:color-mix(in srgb,var(--iicp-ink) 40%,transparent);font-variant-numeric:tabular-nums}
.iicp-summary-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--iicp-ink);min-width:0}
.iicp-summary-line .iicp-sep{color:color-mix(in srgb,var(--iicp-ink) 30%,transparent)}
.iicp-summary-line .iicp-muted{font-size:12px;color:color-mix(in srgb,var(--iicp-ink) 55%,transparent)}
.iicp-summary-status{font-weight:600}
.iicp-summary-prio{font-weight:500}
.iicp-summary-prio.is-p0{color:var(--iicp-red)}
.iicp-summary-prio.is-p1{color:var(--iicp-amber)}
.iicp-dart-list{display:flex;flex-direction:column;gap:0;min-width:0}
.iicp-ov-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
.iicp-ov-item{display:grid;gap:3px;min-width:0}
.iicp-ov-item.is-wide{grid-column:1 / -1}
.iicp-ov-label{font-size:11px;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-ov-value{font-size:13px;line-height:1.5;color:var(--iicp-ink);word-break:break-word;white-space:pre-wrap}
.iicp-ov-value.is-empty{color:color-mix(in srgb,var(--iicp-ink) 32%,transparent)}
.iicp-ov-value.is-overdue{color:var(--iicp-red);font-weight:500}
.iicp-dsubs{display:flex;flex-direction:column;gap:0}
.iicp-dsub{display:flex;align-items:flex-start;gap:8px;width:100%;min-height:30px;padding:4px 2px;border:none;border-radius:6px;background:transparent;font:inherit;font-size:13px;line-height:1.45;color:color-mix(in srgb,var(--iicp-ink) 78%,transparent);text-align:left;cursor:pointer}
.iicp-dsub:hover{background:color-mix(in srgb,var(--iicp-ink) 4%,transparent)}
.iicp-dsub-box{flex:none;width:15px;height:15px;margin-top:2px;border-radius:4px;border:1px solid var(--iicp-line-strong);display:grid;place-items:center;color:transparent;background:transparent}
.iicp-dsub.done .iicp-dsub-box{background:var(--iicp-ink);border-color:var(--iicp-ink);color:var(--iicp-surface)}
.iicp-dsub-text{flex:1;min-width:0;overflow-wrap:anywhere}
.iicp-dsub.done .iicp-dsub-text{color:color-mix(in srgb,var(--iicp-ink) 45%,transparent);text-decoration:line-through}
.iicp-dsub-src{flex:none;font-size:10px;color:var(--iicp-ink-4);border:0.5px solid var(--iicp-line-soft);border-radius:4px;padding:0 4px}
/* 前置依赖：抽屉列表 / 弹窗选择器 */
.iicp-deps{display:flex;flex-direction:column;gap:2px}
.iicp-dep{display:flex;align-items:center;gap:8px;min-height:26px;font-size:12px;color:color-mix(in srgb,var(--iicp-ink) 78%,transparent)}
.iicp-dep .iicp-dot{margin-top:0}
.iicp-dep-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.iicp-dep-project{flex:none;font-size:11px;color:var(--iicp-ink-4);max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.iicp-dep-state{flex:none;font-size:11px;color:var(--iicp-ink-4)}
.iicp-dep-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.iicp-dep-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:26px;padding:0 8px;border-radius:6px;background:color-mix(in srgb,var(--iicp-ink) 5%,transparent);font-size:12px}
.iicp-dep-chip .iicp-dot{margin-top:0}
.iicp-dep-chip .iicp-dep-title{max-width:180px}
.iicp-dep-chip button{border:none;background:transparent;color:var(--iicp-ink-3);cursor:pointer;padding:0 2px;font-size:14px;line-height:1}
.iicp-dep-chip button:hover{color:var(--iicp-ink)}
.iicp-dep-picker{display:flex;align-items:center;gap:6px}
.iicp-dep-picker select{flex:1;min-width:0}
.iicp-dsub-del{flex:none;width:20px;height:20px;display:grid;place-items:center;border:none;border-radius:4px;background:transparent;color:color-mix(in srgb,var(--iicp-ink) 40%,transparent);cursor:pointer;opacity:0;padding:0;font-size:14px}
.iicp-dsub:hover .iicp-dsub-del{opacity:1}
.iicp-dsub-del:hover{color:var(--iicp-ink);background:color-mix(in srgb,var(--iicp-ink) 6%,transparent)}
.iicp-dart{display:flex;align-items:baseline;gap:8px;min-height:30px;padding:3px 0;min-width:0;font-size:13px;color:var(--iicp-ink)}
.iicp-dart-name{flex:none;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.iicp-dart-path{flex:1;min-width:0;font-size:11px;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.iicp-hist{display:flex;flex-direction:column;gap:6px;font-size:11px;color:color-mix(in srgb,var(--iicp-ink) 45%,transparent)}
.iicp-hist-row{display:flex;gap:6px;min-width:0;align-items:baseline}
.iicp-hist-time{flex:none;font-variant-numeric:tabular-nums}
.iicp-hist-note{min-width:0;overflow-wrap:anywhere;color:color-mix(in srgb,var(--iicp-ink) 62%,transparent)}
.iicp-drawer-foot{flex:none;display:flex;align-items:center;gap:8px;padding:12px 20px;border-top:0.5px solid var(--iicp-line-soft);background:var(--iicp-surface)}
.iicp-drawer-foot .spacer{flex:1}
.iicp-note-tiny{font-size:11px;line-height:1.5;color:color-mix(in srgb,var(--iicp-ink) 40%,transparent)}
/* =========================================================================
   全局 · 深空 HUD 主题（v0.4）
   视觉语言：深蓝底 + 青色发光线框 + 状态色（工作绿 / 空闲黄 / 受阻粉）。
   基础 token、顶栏、按钮、弹窗、抽屉等由本段统一接管；
   看板列 / 项目卡片 / 任务卡片的专属细节在文件末尾继续延展。
   ========================================================================= */
.iicp-board{
  --iicp-hud-cyan:#4ce6ff;
  --iicp-hud-blue:#3b82f6;
  --iicp-hud-green:#46f2a4;
  --iicp-hud-yellow:#ffd75e;
  --iicp-hud-pink:#ff6b8b;
  --iicp-ink:#eaf8ff;
  --iicp-ink-2:#a6d7ee;
  --iicp-ink-3:#7fb5d3;
  --iicp-ink-4:#5b88aa;
  --iicp-line:rgba(84,206,255,.30);
  --iicp-line-soft:rgba(84,206,255,.15);
  --iicp-line-strong:rgba(124,232,255,.55);
  --iicp-surface:rgba(8,31,59,.82);
  --iicp-accent:#4ce6ff;
  --iicp-red:#ff6b8b;
  --iicp-amber:#ffd75e;
  --iicp-hover:rgba(76,230,255,.10);
  --iicp-mask:rgba(1,7,18,.72);
  background:
    radial-gradient(900px 520px at 50% -12%,rgba(56,160,255,.30),transparent 70%),
    radial-gradient(640px 420px at 6% 8%,rgba(0,229,255,.12),transparent 72%),
    radial-gradient(640px 420px at 94% 18%,rgba(114,65,255,.16),transparent 72%),
    linear-gradient(180deg,#05213f 0%,#04162e 46%,#020b1c 100%);
  color:var(--iicp-ink);
  position:relative;
  isolation:isolate;
}
.iicp-board::before{
  content:"";
  position:absolute;
  inset:0;
  z-index:0;
  pointer-events:none;
  background-image:
    linear-gradient(rgba(76,230,255,.055) 1px,transparent 1px),
    linear-gradient(90deg,rgba(76,230,255,.055) 1px,transparent 1px),
    radial-gradient(circle at 50% 0,rgba(76,230,255,.10),transparent 58%);
  background-size:48px 48px,48px 48px,100% 100%;
  -webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,.9),rgba(0,0,0,.22) 72%,transparent);
  mask-image:linear-gradient(180deg,rgba(0,0,0,.9),rgba(0,0,0,.22) 72%,transparent);
}
.iicp-board>.iicp-header,
.iicp-board>.iicp-view,
.iicp-board>.iicp-loading,
.iicp-board>.iicp-empty-state,
.iicp-board>.iicp-team-roster-title{
  position:relative;
  z-index:1;
}
.iicp-board .iicp-title{
  color:#f4fdff;
  font-weight:700;
  letter-spacing:.02em;
  text-shadow:0 0 18px rgba(76,230,255,.45);
}
.iicp-board .iicp-stats-line{color:#8fc7e4}
.iicp-board .iicp-stats-total{color:#dff8ff}
.iicp-board .iicp-dot.is-backlog{background:#6f9db8;box-shadow:0 0 6px rgba(111,157,184,.55)}
.iicp-board .iicp-dot.is-in_progress{background:var(--iicp-hud-cyan);box-shadow:0 0 7px var(--iicp-hud-cyan)}
.iicp-board .iicp-dot.is-blocked{background:var(--iicp-hud-yellow);box-shadow:0 0 7px var(--iicp-hud-yellow)}
.iicp-board .iicp-dot.is-done{background:var(--iicp-hud-green);box-shadow:0 0 7px var(--iicp-hud-green)}
.iicp-board .iicp-btn{
  background:rgba(9,38,72,.68);
  border-color:rgba(76,230,255,.34);
  color:#dcf7ff;
  box-shadow:inset 0 0 14px rgba(76,230,255,.06);
}
.iicp-board .iicp-btn:hover{
  background:rgba(20,63,104,.82);
  border-color:rgba(124,232,255,.70);
  box-shadow:0 0 14px rgba(76,230,255,.22),inset 0 0 14px rgba(76,230,255,.08);
}
.iicp-board .iicp-btn.primary{
  background:linear-gradient(135deg,#6cf2ff,#3b82f6);
  border-color:transparent;
  color:#02172c;
  font-weight:700;
  box-shadow:0 0 18px rgba(76,230,255,.38),inset 0 1px 0 rgba(255,255,255,.45);
}
.iicp-board .iicp-btn.primary:hover{
  background:linear-gradient(135deg,#9af7ff,#4f8cff);
  box-shadow:0 0 24px rgba(76,230,255,.55),inset 0 1px 0 rgba(255,255,255,.45);
}
.iicp-board .iicp-btn.danger{
  color:#ffadc0;
  border-color:rgba(255,107,139,.45);
}
.iicp-board .iicp-btn.danger:hover{
  background:rgba(255,107,139,.12);
  border-color:rgba(255,107,139,.7);
  box-shadow:0 0 12px rgba(255,107,139,.22);
}
.iicp-board .iicp-slimbar{
  border-bottom-color:rgba(76,230,255,.22);
  gap:8px;
}
.iicp-team-view .iicp-slimbar::after{
  content:"SQUAD · ONLINE";
  margin-left:auto;
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:9px;
  font-weight:600;
  letter-spacing:.22em;
  color:var(--iicp-hud-green);
  text-shadow:0 0 10px rgba(70,242,164,.55);
}
.iicp-team-view .iicp-slimbar::before{
  content:"";
  order:99;
  width:6px;
  height:6px;
  margin-left:-2px;
  border-radius:50%;
  background:var(--iicp-hud-green);
  box-shadow:0 0 8px var(--iicp-hud-green);
  animation:iicpHudPulse 2s ease-in-out infinite;
}
.iicp-board .iicp-view-switch{
  background:rgba(6,26,50,.72);
  border-color:rgba(76,230,255,.25);
  box-shadow:inset 0 0 16px rgba(76,230,255,.05);
}
.iicp-board .iicp-view-switch button{color:#8fc7e4}
.iicp-board .iicp-view-switch button:hover{background:rgba(76,230,255,.08);color:#eaf8ff}
.iicp-board .iicp-view-switch button[aria-pressed="true"]{
  background:linear-gradient(135deg,rgba(76,230,255,.24),rgba(59,130,246,.28));
  color:#ffffff;
  text-shadow:0 0 10px rgba(76,230,255,.55);
  box-shadow:inset 0 0 0 1px rgba(124,232,255,.38),0 0 14px rgba(76,230,255,.18);
}
.iicp-board .iicp-team-view{padding-top:12px}
.iicp-board .iicp-team{
  padding:14px 2px 30px;
  gap:20px;
  scrollbar-width:thin;
  scrollbar-color:rgba(76,230,255,.45) transparent;
}
.iicp-board ::-webkit-scrollbar-thumb{
  background:linear-gradient(180deg,rgba(59,130,246,.8),rgba(76,230,255,.85));
  border-radius:99px;
}
.iicp-board :focus-visible{outline-color:rgba(76,230,255,.75)}
/* —— 分节标题 —— */
.iicp-board .iicp-team-section{order:0;gap:10px}
.iicp-board .iicp-team-section>h3,
.iicp-board .iicp-team-hero-heading h3,
.iicp-board .iicp-team-roster-title{
  display:flex;
  align-items:center;
  gap:9px;
  margin:0;
  font-size:11px;
  font-weight:700;
  letter-spacing:.16em;
  text-transform:uppercase;
  color:#8fe7ff;
}
.iicp-board .iicp-team-section>h3::before,
.iicp-board .iicp-team-hero-heading h3::before,
.iicp-board .iicp-team-roster-title::before{
  content:"";
  flex:none;
  width:3px;
  height:12px;
  border-radius:2px;
  background:linear-gradient(180deg,#9df6ff,#3b82f6);
  box-shadow:0 0 9px rgba(76,230,255,.8);
}
.iicp-board .iicp-team-section>h3 span,
.iicp-board .iicp-team-hero-heading h3 span,
.iicp-board .iicp-team-roster-title span{
  font-size:10px;
  font-weight:500;
  letter-spacing:.04em;
  text-transform:none;
  color:#5f97b9;
}
.iicp-board .iicp-team-roster-title{
  margin:20px 0 10px;
  position:relative;
  z-index:1;
}
/* —— 队长指挥台 + 团队总览 —— */
.iicp-board .iicp-team-hero{
  order:1;
  display:grid;
  grid-template-columns:minmax(190px,.82fr) minmax(320px,1.55fr) minmax(206px,.86fr);
  gap:14px;
  align-items:stretch;
}
.iicp-board .iicp-team-hero-main{
  display:flex;
  flex-direction:column;
  gap:10px;
  min-width:0;
}
.iicp-board .iicp-team-hero-main>.iicp-team-lead{
  flex:1;
}
.iicp-board .iicp-team-hero-main>.iicp-team-lead .iicp-team-card-actions{
  margin-top:auto;
}
.iicp-board .iicp-team-hero-heading{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
.iicp-board .iicp-team-kicker,
.iicp-board .iicp-team-overview-kicker{
  order:2;
  font-size:9px;
  font-weight:600;
  letter-spacing:.26em;
  text-transform:uppercase;
  color:#5fd8ff;
  padding:3px 7px;
  border:1px solid rgba(76,230,255,.32);
  border-radius:4px;
  background:rgba(76,230,255,.07);
}
.iicp-board .iicp-team-lead{
  position:relative;
  display:flex;
  flex-direction:column;
  gap:10px;
  max-width:none;
  padding:18px;
  overflow:hidden;
  border:1px solid rgba(76,230,255,.42);
  border-radius:16px;
  background:
    radial-gradient(120% 160% at 50% -30%,rgba(76,230,255,.17),transparent 60%),
    linear-gradient(180deg,rgba(10,42,78,.92),rgba(5,24,48,.95));
  box-shadow:
    inset 0 0 0 1px rgba(76,230,255,.06),
    inset 0 1px 0 rgba(255,255,255,.10),
    0 0 36px rgba(38,133,255,.16);
}
.iicp-board .iicp-team-lead::before{
  content:"";
  position:absolute;
  left:18px;
  right:18px;
  top:0;
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(155,247,255,.95),transparent);
  box-shadow:0 0 12px rgba(76,230,255,.6);
}
.iicp-board .iicp-team-lead::after{
  content:"";
  position:absolute;
  left:50%;
  bottom:-54px;
  width:320px;
  height:120px;
  transform:translateX(-50%);
  border-radius:50%;
  background:radial-gradient(closest-side,rgba(76,230,255,.20),rgba(59,130,246,.08) 55%,transparent 75%);
  border:1px solid rgba(76,230,255,.18);
  pointer-events:none;
}
.iicp-board .iicp-team-lead>*{position:relative;z-index:1}
.iicp-board .iicp-team-lead-head{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:10px 14px;
}
.iicp-board .iicp-team-lead-tags{
  grid-column:1/-1;
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:6px;
}
.iicp-board .iicp-team-lead .iicp-team-avatar{
  width:64px;
  height:64px;
  font-size:23px;
  border:1px solid rgba(180,247,255,.7);
  background:radial-gradient(circle at 32% 26%,#c9fbff,#38bdf8 42%,#1d4ed8 78%,#0b2a5e);
  color:#f2feff;
  text-shadow:0 1px 8px rgba(0,20,40,.55);
  box-shadow:
    0 0 0 4px rgba(76,230,255,.08),
    0 0 24px rgba(56,189,248,.55),
    inset 0 -8px 14px rgba(0,20,50,.35);
  animation:iicpHudBreathe 3.6s ease-in-out infinite;
}
.iicp-board .iicp-team-lead .iicp-team-name{
  font-size:22px;
  font-weight:700;
  letter-spacing:.01em;
  color:#f5feff;
  text-shadow:0 0 18px rgba(76,230,255,.30);
}
.iicp-board .iicp-team-lead .iicp-team-sub{font-size:12px;color:#8cc8e6}
.iicp-board .iicp-team-crown{
  position:relative;
  display:inline-flex;
  align-items:center;
  gap:4px;
  font-size:10px;
  font-weight:600;
  letter-spacing:.08em;
  color:#ffe7a0;
  border:1px solid rgba(255,215,94,.42);
  border-radius:99px;
  padding:3px 9px;
  background:rgba(255,215,94,.10);
  box-shadow:0 0 12px rgba(255,215,94,.14);
}
.iicp-board .iicp-team-crown::before{
  content:"♛";
  font-size:11px;
  line-height:1;
  color:#ffd75e;
  text-shadow:0 0 8px rgba(255,215,94,.8);
}
.iicp-board .iicp-team-bio{color:#a6d7ee;font-size:12.5px}
.iicp-board .iicp-team-skills{gap:6px}
.iicp-board .iicp-team-skill{
  font-size:10px;
  line-height:1.7;
  color:#9cdcf5;
  border:1px solid rgba(76,230,255,.22);
  border-radius:99px;
  padding:0 8px;
  background:rgba(76,230,255,.07);
}
/* —— 指标格 —— */
.iicp-board .iicp-team-metrics{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:6px;
  font-size:10px;
  letter-spacing:.04em;
  color:#7fb5d3;
}
.iicp-board .iicp-team-metrics span{
  display:flex;
  flex-direction:column-reverse;
  gap:1px;
  min-width:0;
  padding:7px 9px;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
  border:1px solid rgba(76,230,255,.15);
  border-radius:8px;
  background:rgba(76,230,255,.055);
}
.iicp-board .iicp-team-metrics b{
  font-size:18px;
  font-weight:700;
  line-height:1.05;
  color:#eaffff;
  text-shadow:0 0 12px rgba(76,230,255,.35);
  font-variant-numeric:tabular-nums;
}
.iicp-board .iicp-team-card .iicp-team-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
.iicp-board .iicp-team-card .iicp-team-metrics b{font-size:16px}
/* —— 团队总览侧栏 —— */
.iicp-board .iicp-team-overview{
  position:relative;
  display:flex;
  flex-direction:column;
  gap:12px;
  padding:14px;
  overflow:hidden;
  border:1px solid rgba(76,230,255,.28);
  border-radius:16px;
  background:linear-gradient(180deg,rgba(8,32,60,.78),rgba(4,18,36,.92));
  box-shadow:inset 0 0 30px rgba(76,230,255,.05);
}
.iicp-board .iicp-team-overview::before{
  content:"";
  position:absolute;
  left:14px;
  right:14px;
  top:0;
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(76,230,255,.7),transparent);
}
.iicp-board .iicp-team-overview-head{
  display:flex;
  flex-direction:column;
  gap:5px;
}
.iicp-board .iicp-team-overview-kicker{order:0;align-self:flex-start}
.iicp-board .iicp-team-overview-head h3{
  margin:0;
  font-size:15px;
  font-weight:600;
  color:#f2fdff;
}
.iicp-board .iicp-team-overview-title{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  min-width:0;
}
.iicp-board .iicp-team-roster-link{
  flex:none;
  display:inline-flex;
  align-items:center;
  gap:4px;
  height:22px;
  padding:0 7px;
  border:1px solid rgba(76,230,255,.28);
  border-radius:6px;
  background:rgba(76,230,255,.06);
  color:#8fe7ff;
  font:inherit;
  font-size:9px;
  letter-spacing:.04em;
  cursor:pointer;
  white-space:nowrap;
}
.iicp-board .iicp-team-roster-link b{
  color:#eaffff;
  font-size:10px;
  font-variant-numeric:tabular-nums;
}
.iicp-board .iicp-team-roster-link:hover{
  border-color:rgba(76,230,255,.6);
  background:rgba(76,230,255,.13);
  box-shadow:0 0 10px rgba(76,230,255,.18);
}
.iicp-board .iicp-team-overview-list{
  display:flex;
  flex-direction:column;
  gap:6px;
  font-size:11px;
  color:#8fc7e4;
}
.iicp-board .iicp-team-overview-list span{
  display:flex;
  align-items:baseline;
  gap:7px;
  min-width:0;
  white-space:nowrap;
}
.iicp-board .iicp-team-overview-list i{
  flex:none;
  width:13px;
  height:13px;
  border-radius:50%;
  border:1px solid rgba(70,242,164,.6);
  background:rgba(70,242,164,.12);
  box-shadow:0 0 7px rgba(70,242,164,.35);
  transform:translateY(2px);
}
.iicp-board .iicp-team-overview-list i::after{
  content:"✓";
  display:block;
  margin-top:-3px;
  font-size:9px;
  font-style:normal;
  line-height:13px;
  text-align:center;
  color:#8dffc8;
}
.iicp-board .iicp-team-overview-list b{
  min-width:16px;
  font-size:14px;
  font-weight:700;
  color:#eaffff;
  font-variant-numeric:tabular-nums;
  text-shadow:0 0 10px rgba(76,230,255,.3);
}
/* —— 任务总监 —— */
.iicp-board .iicp-team-taskview{
  background:
    radial-gradient(120% 70% at 50% 0,rgba(76,230,255,.08),transparent 70%),
    linear-gradient(180deg,rgba(8,32,60,.84),rgba(4,18,36,.94));
}
.iicp-board .iicp-team-taskview .iicp-team-overview-list{gap:9px}
.iicp-board .iicp-team-taskview .iicp-team-overview-list span{align-items:center}
.iicp-board .iicp-team-taskview .iicp-team-overview-list i{
  width:9px;
  height:9px;
  border:0;
  background:#4ce6ff;
  box-shadow:0 0 8px rgba(76,230,255,.55);
  transform:none;
}
.iicp-board .iicp-team-taskview .iicp-team-overview-list i::after{display:none}
.iicp-board .iicp-team-taskview .iicp-team-overview-list .is-review i{
  background:#ffd75e;
  box-shadow:0 0 8px rgba(255,215,94,.55);
}
.iicp-board .iicp-team-taskview .iicp-team-overview-list .is-blocked i{
  background:#ff6b8b;
  box-shadow:0 0 8px rgba(255,107,139,.55);
}
.iicp-board .iicp-team-taskview .iicp-team-overview-list .is-unassigned i{
  background:#8fb8d6;
  box-shadow:0 0 8px rgba(143,184,214,.45);
}
.iicp-board .iicp-team-taskflow{
  display:flex;
  flex-direction:column;
  gap:8px;
  margin-top:auto;
  padding-top:12px;
  border-top:1px solid rgba(76,230,255,.14);
}
.iicp-board .iicp-team-taskflow-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  font-size:9px;
  font-weight:600;
  letter-spacing:.22em;
  text-transform:uppercase;
  color:#5fd8ff;
}
.iicp-board .iicp-team-taskflow-head b{
  font-size:12px;
  letter-spacing:0;
  color:#eaffff;
  font-variant-numeric:tabular-nums;
}
.iicp-board .iicp-team-taskflow-bar{
  display:flex;
  height:7px;
  overflow:hidden;
  border:1px solid rgba(76,230,255,.16);
  border-radius:99px;
  background:rgba(76,230,255,.08);
}
.iicp-board .iicp-team-taskflow-bar i{height:100%;min-width:0}
.iicp-board .iicp-team-taskflow-bar .is-backlog{background:linear-gradient(90deg,#6f9db8,#8fb8d6)}
.iicp-board .iicp-team-taskflow-bar .is-in_progress{background:linear-gradient(90deg,#3b82f6,#4ce6ff)}
.iicp-board .iicp-team-taskflow-bar .is-blocked{background:linear-gradient(90deg,#ff6b8b,#ffb36b)}
.iicp-board .iicp-team-taskflow-bar .is-done{background:linear-gradient(90deg,#46f2a4,#4ce6ff)}
.iicp-board .iicp-team-taskflow-foot{
  display:flex;
  justify-content:space-between;
  gap:8px;
  font-size:10px;
  color:#7fb5d3;
  white-space:nowrap;
}
/* —— 侧栏雷达 —— */
.iicp-board .iicp-team-radar{
  position:relative;
  flex:1;
  min-height:118px;
  margin-top:2px;
  border-radius:12px;
  background:radial-gradient(circle at 50% 50%,rgba(76,230,255,.10),transparent 68%);
}
.iicp-board .iicp-team-radar::before{
  content:"";
  position:absolute;
  left:50%;
  top:50%;
  width:120px;
  height:1px;
  transform:translate(-50%,-50%);
  background:linear-gradient(90deg,transparent,rgba(76,230,255,.22),transparent);
}
.iicp-board .iicp-team-radar::after{
  content:"";
  position:absolute;
  left:50%;
  top:50%;
  height:112px;
  width:1px;
  transform:translate(-50%,-50%);
  background:linear-gradient(180deg,transparent,rgba(76,230,255,.18),transparent);
}
.iicp-board .iicp-team-radar-ring{
  position:absolute;
  left:50%;
  top:50%;
  width:104px;
  height:104px;
  margin:-52px 0 0 -52px;
  border:1px solid rgba(76,230,255,.18);
  border-radius:50%;
}
.iicp-board .iicp-team-radar-ring:nth-child(2){
  width:66px;
  height:66px;
  margin:-33px 0 0 -33px;
  border-style:dashed;
  animation:iicpHudSpin 26s linear infinite;
}
.iicp-board .iicp-team-radar-core{
  position:absolute;
  left:50%;
  top:50%;
  width:36px;
  height:36px;
  transform:translate(-50%,-50%);
  display:grid;
  place-items:center;
  border:1px solid rgba(200,250,255,.8);
  border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#d3fcff,#38bdf8 42%,#1d4ed8);
  color:#04162e;
  font-size:13px;
  font-weight:700;
  box-shadow:0 0 18px rgba(76,230,255,.6);
  z-index:2;
}
.iicp-board .iicp-team-radar-node{
  position:absolute;
  width:22px;
  height:22px;
  display:grid;
  place-items:center;
  border:1px solid rgba(200,250,255,.6);
  border-radius:50%;
  background:linear-gradient(135deg,#4fd1ff,#3b82f6);
  color:#ffffff;
  font-size:9px;
  font-weight:700;
  box-shadow:0 0 10px rgba(76,230,255,.45);
  z-index:2;
}
.iicp-board .iicp-team-radar-node.n1{left:12%;top:58%}
.iicp-board .iicp-team-radar-node.n2{right:12%;top:58%}
.iicp-board .iicp-team-radar-node.n3{left:50%;top:10%;transform:translateX(-50%)}
/* —— 队长到成员的分支光路 —— */
.iicp-board .iicp-team-branch{
  order:2;
  flex:0 0 34px;
  position:relative;
  height:34px;
  margin:-8px 0 -10px;
  pointer-events:none;
}
.iicp-board .iicp-team-branch::before{
  content:"";
  position:absolute;
  left:50%;
  top:0;
  width:1px;
  height:50%;
  background:linear-gradient(180deg,rgba(76,230,255,.8),rgba(76,230,255,.25));
  box-shadow:0 0 8px rgba(76,230,255,.65);
}
.iicp-board .iicp-team-branch::after{
  content:"";
  position:absolute;
  left:7%;
  right:7%;
  top:50%;
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(76,230,255,.72) 12%,rgba(76,230,255,.72) 88%,transparent);
  box-shadow:0 0 10px rgba(76,230,255,.45);
}
.iicp-board .iicp-team-branch i{
  position:absolute;
  top:50%;
  width:1px;
  height:15px;
  background:linear-gradient(180deg,rgba(76,230,255,.6),transparent);
  box-shadow:0 0 6px rgba(76,230,255,.4);
}
.iicp-board .iicp-team-branch i:nth-child(1){left:12.5%}
.iicp-board .iicp-team-branch i:nth-child(2){left:37.5%}
.iicp-board .iicp-team-branch i:nth-child(3){left:62.5%}
.iicp-board .iicp-team-branch i:nth-child(4){left:87.5%}
/* —— 工作成员卡片 —— */
.iicp-board .iicp-team-workers{order:3}
.iicp-board .iicp-team-grid{
  gap:12px;
  grid-template-columns:repeat(4,minmax(0,1fr));
}
.iicp-board .iicp-team-card{
  position:relative;
  gap:10px;
  padding:14px;
  overflow:hidden;
  border:1px solid rgba(76,230,255,.26);
  border-radius:14px;
  background:
    radial-gradient(120% 120% at 0% 0%,rgba(76,230,255,.10),transparent 52%),
    linear-gradient(180deg,rgba(9,36,68,.90),rgba(4,20,40,.94));
  box-shadow:inset 0 0 26px rgba(59,130,246,.06),0 10px 26px rgba(0,0,0,.24);
  transition:transform .2s,border-color .2s,box-shadow .2s;
}
.iicp-board .iicp-team-card::before{
  content:"";
  position:absolute;
  left:14px;
  right:14px;
  top:0;
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(76,230,255,.8),transparent);
  opacity:.55;
}
.iicp-board .iicp-team-card:hover{
  transform:translateY(-2px);
  border-color:rgba(124,232,255,.55);
  box-shadow:inset 0 0 30px rgba(76,230,255,.08),0 0 30px rgba(76,230,255,.12),0 14px 30px rgba(0,0,0,.30);
}
.iicp-board .iicp-team-card[data-status="working"]{border-color:rgba(70,242,164,.36)}
.iicp-board .iicp-team-card[data-status="working"]:hover{
  border-color:rgba(70,242,164,.62);
  box-shadow:inset 0 0 30px rgba(70,242,164,.07),0 0 30px rgba(70,242,164,.12),0 14px 30px rgba(0,0,0,.30);
}
.iicp-board .iicp-team-card[data-status="blocked"]{border-color:rgba(255,107,139,.40)}
.iicp-board .iicp-team-card-head{
  display:grid;
  grid-template-columns:44px minmax(0,1fr);
  grid-template-areas:
    "avatar id"
    "avatar tag";
  align-items:center;
  column-gap:10px;
  row-gap:4px;
}
.iicp-board .iicp-team-card-head .iicp-team-avatar{grid-area:avatar}
.iicp-board .iicp-team-card-head .iicp-team-id{grid-area:id}
.iicp-board .iicp-team-card-head .iicp-team-tag{
  grid-area:tag;
  justify-self:start;
  margin-left:0;
}
.iicp-board .iicp-team-avatar{
  position:relative;
  flex:none;
  width:44px;
  height:44px;
  border:1px solid rgba(160,245,255,.55);
  border-radius:50%;
  background:radial-gradient(circle at 32% 26%,#c6faff,#38bdf8 42%,#1d4ed8 78%,#0b2a5e);
  color:#f2feff;
  font-size:16px;
  font-weight:700;
  text-shadow:0 1px 6px rgba(0,20,40,.55);
  box-shadow:
    0 0 0 3px rgba(76,230,255,.06),
    0 0 16px rgba(56,189,248,.38),
    inset 0 -6px 10px rgba(0,20,50,.32);
}
.iicp-board .iicp-team-card-head .iicp-team-avatar{width:44px;height:44px;font-size:16px}
.iicp-board .iicp-team-avatar::after{
  content:"";
  position:absolute;
  right:-1px;
  bottom:-1px;
  width:10px;
  height:10px;
  border:2px solid #061a34;
  border-radius:50%;
  background:var(--iicp-hud-yellow);
  box-shadow:0 0 8px var(--iicp-hud-yellow);
}
.iicp-board .iicp-team-lead[data-status="working"] .iicp-team-avatar::after,
.iicp-board .iicp-team-card[data-status="working"] .iicp-team-avatar::after{
  background:var(--iicp-hud-green);
  box-shadow:0 0 8px var(--iicp-hud-green);
  animation:iicpHudPulse 2s ease-in-out infinite;
}
.iicp-board .iicp-team-lead[data-status="blocked"] .iicp-team-avatar::after,
.iicp-board .iicp-team-card[data-status="blocked"] .iicp-team-avatar::after{
  background:var(--iicp-hud-pink);
  box-shadow:0 0 8px var(--iicp-hud-pink);
}
.iicp-board .iicp-team-card .iicp-team-name{font-size:15px;font-weight:600;color:#f4fdff}
.iicp-board .iicp-team-card .iicp-team-sub{font-size:11px;color:#7fb5d3}
.iicp-board .iicp-team-card-head .iicp-team-tag{margin-left:0}
/* —— 状态胶囊 —— */
.iicp-board .iicp-team-tag{
  position:relative;
  display:inline-flex;
  align-items:center;
  gap:0;
  height:22px;
  padding:0 9px 0 19px;
  border:1px solid rgba(76,230,255,.30);
  border-radius:99px;
  background:rgba(76,230,255,.08);
  color:#9fe9ff;
  font-size:10px;
  font-weight:600;
  line-height:1;
  letter-spacing:.08em;
  white-space:nowrap;
  text-transform:uppercase;
}
.iicp-board .iicp-team-tag::before{
  content:"";
  position:absolute;
  left:7px;
  top:50%;
  width:5px;
  height:5px;
  margin-top:-2.5px;
  border-radius:50%;
  background:currentColor;
  box-shadow:0 0 6px currentColor;
}
.iicp-board .iicp-team-tag.is-idle{
  color:#ffe28a;
  border-color:rgba(255,215,94,.40);
  background:rgba(255,215,94,.10);
}
.iicp-board .iicp-team-tag.is-working{
  color:#8dffc8;
  border-color:rgba(70,242,164,.45);
  background:rgba(70,242,164,.12);
}
.iicp-board .iicp-team-tag.is-blocked,
.iicp-board .iicp-team-tag.is-review{
  color:#ffadc0;
  border-color:rgba(255,107,139,.45);
  background:rgba(255,107,139,.12);
}
/* —— 卡片动作 —— */
.iicp-board .iicp-team-card-actions{gap:6px}
.iicp-board .iicp-team-card-actions-spacer{flex:1}
/* 队长卡动作行：新增成员（主按钮）左、编辑右 */
.iicp-board .iicp-team-lead .iicp-team-card-actions{
  display:flex;
  align-items:center;
  margin-top:auto;
}
.iicp-board .iicp-team-card-actions .iicp-btn{
  height:28px;
  padding:0 10px;
  font-size:11px;
  color:#a9eaff;
  border-color:rgba(76,230,255,.28);
  background:rgba(76,230,255,.06);
}
.iicp-board .iicp-team-card-actions .iicp-btn:first-child{
  color:#8dffc8;
  border-color:rgba(70,242,164,.36);
  background:rgba(70,242,164,.08);
}
.iicp-board .iicp-team-card-actions .iicp-btn:first-child:hover{
  border-color:rgba(70,242,164,.7);
  box-shadow:0 0 12px rgba(70,242,164,.20);
}
.iicp-board .iicp-team-lead .iicp-team-card-actions .iicp-btn{
  height:26px;
  padding:0 9px;
  font-size:11px;
}
.iicp-board .iicp-team-lead .iicp-team-card-actions .iicp-btn.primary{
  gap:6px;
}
/* —— 待验收队列 —— */
.iicp-board .iicp-team-reviews{order:4}
.iicp-board .iicp-team-reviews>h3 span{color:#ffadc0}
.iicp-board .iicp-review-list{gap:9px}
.iicp-board .iicp-review-row{
  position:relative;
  gap:8px;
  padding:12px 14px 12px 16px;
  overflow:hidden;
  border:1px solid rgba(255,215,94,.28);
  border-radius:12px;
  background:linear-gradient(90deg,rgba(255,215,94,.10),rgba(8,30,58,.82) 38%,rgba(5,22,44,.9));
  box-shadow:inset 0 0 22px rgba(255,215,94,.04);
}
.iicp-board .iicp-review-row::before{
  content:"";
  position:absolute;
  left:0;
  top:0;
  bottom:0;
  width:3px;
  background:linear-gradient(180deg,#ffe28a,#ffb020);
  box-shadow:0 0 12px rgba(255,215,94,.65);
}
.iicp-board .iicp-review-title{color:#f5feff}
.iicp-board .iicp-review-by{color:#8fc7e4}
.iicp-board .iicp-review-note{color:#a6d7ee}
.iicp-board .iicp-review-actions .iicp-btn{height:28px;padding:0 12px;font-size:11px}
/* —— 缺队长提示 / 空态 —— */
.iicp-board .iicp-team-banner{
  order:6;
  border:1px solid rgba(255,215,94,.35);
  border-radius:12px;
  background:rgba(255,215,94,.08);
  color:#ffebae;
}
.iicp-board .iicp-team-empty{
  order:0;
  padding:16px;
  border:1px dashed rgba(76,230,255,.24);
  border-radius:12px;
  background:rgba(8,30,56,.38);
  color:#6fa5c4;
  text-align:center;
}
.iicp-board .iicp-team-hero .iicp-team-empty{
  margin:0;
  border-color:rgba(76,230,255,.20);
}
/* —— 全员明细弹窗 —— */
.iicp-board .iicp-roster-modal{
  width:min(940px,calc(100vw - 32px));
  max-height:calc(100vh - 80px);
}
.iicp-board .iicp-roster-modal .iicp-modal-body{
  overflow-y:auto;
}
.iicp-board .iicp-roster-scroll{
  min-height:0;
  overflow-x:auto;
  border-radius:14px;
}
.iicp-board .iicp-roster-table{
  width:100%;
  min-width:760px;
}
/* —— 全员明细表 —— */
.iicp-board .iicp-table{
  table-layout:auto;
  overflow:hidden;
  border:1px solid rgba(76,230,255,.20);
  border-radius:14px;
  border-collapse:separate;
  border-spacing:0;
  background:linear-gradient(180deg,rgba(8,30,58,.62),rgba(4,18,36,.62));
  box-shadow:inset 0 0 26px rgba(76,230,255,.04);
}
.iicp-board .iicp-table th{
  padding:9px 12px;
  border-bottom:1px solid rgba(76,230,255,.20);
  background:rgba(76,230,255,.055);
  color:#6fb8d8;
  font-size:10px;
  font-weight:600;
  letter-spacing:.10em;
  text-transform:uppercase;
}
.iicp-board .iicp-table td{
  padding:10px 12px;
  border-bottom:1px solid rgba(76,230,255,.09);
  color:#d9f4ff;
  font-size:12.5px;
}
.iicp-board .iicp-table tr:last-child td{border-bottom:none}
.iicp-board .iicp-table tbody tr:hover td{background:rgba(76,230,255,.045)}
.iicp-board .iicp-table .iicp-team-tag{
  height:auto;
  padding:0 6px;
  border-radius:4px;
  font-size:9px;
  line-height:1.6;
  letter-spacing:.04em;
  text-transform:none;
}
.iicp-board .iicp-table .iicp-team-tag::before{display:none}
.iicp-board .iicp-table .iicp-btn{
  height:26px;
  padding:0 9px;
  font-size:11px;
}
.iicp-board .iicp-table .iicp-team-sub{color:#6fa5c4}
/* —— 成员/派单/验收弹窗 —— */
.iicp-board .iicp-modal-backdrop{
  background:rgba(1,7,18,.72);
  -webkit-backdrop-filter:blur(5px);
  backdrop-filter:blur(5px);
}
.iicp-board .iicp-modal{
  color-scheme:dark;
  color:#eaf8ff;
  border-color:rgba(76,230,255,.35);
  background:
    radial-gradient(120% 100% at 50% 0,rgba(76,230,255,.10),transparent 55%),
    linear-gradient(180deg,#082647,#04162f);
  box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 40px rgba(38,133,255,.12);
}
.iicp-board .iicp-modal h2{color:#f4fdff}
.iicp-board .iicp-field label{color:#7fb5d3;letter-spacing:.04em}
.iicp-board .iicp-field input,
.iicp-board .iicp-field select,
.iicp-board .iicp-field textarea{
  border-color:rgba(76,230,255,.24);
  background:rgba(3,15,32,.78);
  color:#eaf8ff;
}
.iicp-board .iicp-field input::placeholder,
.iicp-board .iicp-field textarea::placeholder{color:#4f7d9c}
.iicp-board .iicp-field input:focus,
.iicp-board .iicp-field select:focus,
.iicp-board .iicp-field textarea:focus{
  border-color:rgba(76,230,255,.7);
  box-shadow:0 0 0 3px rgba(76,230,255,.12),0 0 16px rgba(76,230,255,.12);
}
.iicp-board .iicp-field select option{background:#061a34;color:#eaf8ff}
.iicp-board .iicp-modal-actions{border-top-color:rgba(76,230,255,.14)}
.iicp-board .iicp-modal .iicp-team-sub,
.iicp-board .iicp-modal .iicp-note-tiny{color:#7fb5d3}
.iicp-board .iicp-ov-label{color:#7fb5d3}
.iicp-board .iicp-ov-value{color:#d9f4ff}

/* =========================================================================
   看板 / 项目 / 任务抽屉 · 深空 HUD 延展（v0.4）
   ========================================================================= */
.iicp-board .iicp-view{padding-top:12px}
.iicp-board .iicp-header{padding-bottom:14px}
.iicp-board .iicp-title{
  font-size:22px;
  font-weight:700;
  letter-spacing:.02em;
}
.iicp-board .iicp-search{
  width:212px;
  height:34px;
  border-color:rgba(76,230,255,.30);
  background:rgba(6,26,50,.66);
  box-shadow:inset 0 0 16px rgba(76,230,255,.05);
}
.iicp-board .iicp-search:focus-within{
  border-color:rgba(124,232,255,.70);
  background:rgba(9,38,72,.82);
  box-shadow:0 0 0 3px rgba(76,230,255,.10),0 0 18px rgba(76,230,255,.12);
}
.iicp-board .iicp-search svg{color:#5fd8ff}
.iicp-board .iicp-search input{color:#eaf8ff}
.iicp-board .iicp-search input::placeholder{color:#4f7d9c}

/* 顶栏右侧装饰：看板 / 项目 */
.iicp-board[data-view="board"] .iicp-slimbar::after,
.iicp-board[data-view="projects"] .iicp-slimbar::after{
  content:"KANBAN · LIVE";
  margin-left:auto;
  flex:none;
  font-size:9px;
  font-weight:600;
  letter-spacing:.22em;
  color:var(--iicp-hud-green);
  text-shadow:0 0 10px rgba(70,242,164,.55);
}
.iicp-board[data-view="projects"] .iicp-slimbar::after{content:"PROJECTS · MATRIX"}

/* —— 看板列 —— */
.iicp-board .iicp-columns{gap:14px}
.iicp-board .iicp-column{
  --iicp-col-accent:#6f9db8;
  --iicp-col-glow:rgba(111,157,184,.30);
  position:relative;
  min-width:0;
  min-height:0;
  padding:10px 10px 0;
  border:1px solid rgba(76,230,255,.18);
  border-radius:16px;
  background:
    radial-gradient(120% 120% at 0% 0%,rgba(76,230,255,.07),transparent 52%),
    linear-gradient(180deg,rgba(8,33,63,.72),rgba(3,16,34,.62));
  box-shadow:inset 0 0 30px rgba(76,230,255,.035),0 12px 30px rgba(0,0,0,.16);
}
.iicp-board .iicp-column::before{
  content:"";
  position:absolute;
  left:14px;
  right:14px;
  top:0;
  height:1px;
  background:linear-gradient(90deg,transparent,var(--iicp-col-accent),transparent);
  box-shadow:0 0 12px var(--iicp-col-glow);
  pointer-events:none;
}
.iicp-board .iicp-column:nth-child(1){--iicp-col-accent:#6f9db8;--iicp-col-glow:rgba(111,157,184,.30)}
.iicp-board .iicp-column:nth-child(2){--iicp-col-accent:var(--iicp-hud-cyan);--iicp-col-glow:rgba(76,230,255,.38)}
.iicp-board .iicp-column:nth-child(3){--iicp-col-accent:var(--iicp-hud-yellow);--iicp-col-glow:rgba(255,215,94,.32)}
.iicp-board .iicp-column:nth-child(4){--iicp-col-accent:var(--iicp-hud-green);--iicp-col-glow:rgba(70,242,164,.30)}
.iicp-board .iicp-column.dragover{
  border-color:rgba(124,232,255,.62);
  box-shadow:inset 0 0 34px rgba(76,230,255,.10),0 0 26px rgba(76,230,255,.18);
}
.iicp-board .iicp-column.dragover .iicp-column-head{border-bottom-color:rgba(124,232,255,.72)}
.iicp-board .iicp-column.dragover .iicp-cards{
  outline:1px dashed rgba(76,230,255,.56);
  outline-offset:3px;
  border-radius:10px;
}
.iicp-board .iicp-column.is-collapsed{border-radius:14px;padding:10px 7px;border-right-color:rgba(76,230,255,.18)}
.iicp-board .iicp-column-head{
  padding:2px 2px 10px;
  margin-bottom:10px;
  border-bottom:1px solid rgba(76,230,255,.18);
}
.iicp-board .iicp-col-title{
  font-size:12px;
  font-weight:700;
  letter-spacing:.06em;
  color:#eaf8ff;
}
.iicp-board .iicp-column-count{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:20px;
  height:18px;
  padding:0 6px;
  border:1px solid rgba(76,230,255,.25);
  border-radius:99px;
  background:rgba(76,230,255,.08);
  color:#9fe9ff;
  font-size:10px;
  font-weight:600;
  line-height:1;
}
.iicp-board .iicp-col-toggle{color:#7fb5d3}
.iicp-board .iicp-col-toggle:hover{background:rgba(76,230,255,.08);color:#eaf8ff}
.iicp-board .iicp-col-add{color:#5f97b9}
.iicp-board .iicp-col-add:hover{background:rgba(76,230,255,.10);color:#eaf8ff;box-shadow:0 0 12px rgba(76,230,255,.16)}
.iicp-board .iicp-cards{gap:9px;padding:0 0 14px}
.iicp-board .iicp-pager{
  border-top-color:rgba(76,230,255,.14);
  color:#7fb5d3;
}
.iicp-board .iicp-pager button:hover:not(:disabled){background:rgba(76,230,255,.10);color:#eaf8ff}
.iicp-board .iicp-empty{
  padding:18px 10px;
  border:1px dashed rgba(76,230,255,.20);
  border-radius:10px;
  background:rgba(8,30,56,.30);
  color:#5f97b9;
  text-align:center;
}

/* —— 任务卡片 —— */
.iicp-board .iicp-card{
  --iicp-card-accent:#6f9db8;
  position:relative;
  overflow:hidden;
  padding:12px 13px 11px;
  border:1px solid rgba(76,230,255,.18);
  border-radius:12px;
  background:
    radial-gradient(120% 120% at 0% 0%,rgba(76,230,255,.075),transparent 55%),
    linear-gradient(180deg,rgba(9,36,68,.90),rgba(4,20,40,.94));
  box-shadow:inset 0 0 20px rgba(59,130,246,.05),0 6px 18px rgba(0,0,0,.16);
  transition:transform .18s,border-color .18s,box-shadow .18s,background .18s;
}
.iicp-board .iicp-card::before{
  content:"";
  position:absolute;
  left:13px;
  right:13px;
  top:0;
  height:1px;
  background:linear-gradient(90deg,transparent,var(--iicp-card-accent),transparent);
  opacity:.72;
  box-shadow:0 0 10px var(--iicp-card-accent);
}
.iicp-board .iicp-card::after{
  content:"";
  position:absolute;
  left:0;
  top:14px;
  bottom:14px;
  width:2px;
  border-radius:0 2px 2px 0;
  background:var(--iicp-card-accent);
  opacity:.55;
  box-shadow:0 0 8px var(--iicp-card-accent);
}
.iicp-board .iicp-card:hover{
  transform:translateY(-1px);
  border-color:rgba(124,232,255,.48);
  box-shadow:inset 0 0 24px rgba(76,230,255,.07),0 0 22px rgba(76,230,255,.10),0 10px 24px rgba(0,0,0,.24);
}
.iicp-board .iicp-card.dragging{transform:none;opacity:.35}
.iicp-board .iicp-card.is-in_progress{--iicp-card-accent:var(--iicp-hud-cyan);border-color:rgba(76,230,255,.30)}
.iicp-board .iicp-card.is-blocked{--iicp-card-accent:var(--iicp-hud-pink);border-color:rgba(255,107,139,.34)}
.iicp-board .iicp-card.is-done{--iicp-card-accent:var(--iicp-hud-green);border-color:rgba(70,242,164,.22);opacity:.86}
.iicp-board .iicp-card.is-done:hover{opacity:1}
.iicp-board .iicp-card.is-pinned{border-color:rgba(255,215,94,.48)}
.iicp-board .iicp-card.is-pinned::before{background:linear-gradient(90deg,transparent,var(--iicp-hud-yellow),transparent)}
.iicp-board .iicp-card.is-archived{opacity:.58}
.iicp-board .iicp-card-title,
.iicp-board .iicp-card-open{color:#f4fdff}
.iicp-board .iicp-card-meta{color:#7fb5d3}
.iicp-board .iicp-card-scope{color:#9cdcf5}
.iicp-board .iicp-card-sep{color:#4f7d9c}
.iicp-board .iicp-card-metrics{color:#7fb5d3}
.iicp-board .iicp-prio{color:#8fc7e4}
.iicp-board .iicp-prio.is-p0{color:#ffadc0}
.iicp-board .iicp-prio.is-p1{color:#ffe28a}
.iicp-board .iicp-prio.is-p2{color:#8fe7ff}
.iicp-board .iicp-card-metric.is-done{color:#8dffc8}
.iicp-board .iicp-mark{
  color:#9fe9ff;
  background:rgba(76,230,255,.10);
  border:1px solid rgba(76,230,255,.22);
}
.iicp-board .iicp-ai-mark{color:#8dffc8;text-shadow:0 0 8px rgba(70,242,164,.4)}
.iicp-board .iicp-card-planning{color:#8fc7e4}
.iicp-board .iicp-card-planning .iicp-card-tags{color:#5f97b9}
.iicp-board .iicp-card-planning .iicp-due.is-overdue{color:#ffadc0}
.iicp-board .iicp-card-summary{color:#a6d7ee}
.iicp-board .iicp-card-progress{background:rgba(76,230,255,.10)}
.iicp-board .iicp-card-progress i{background:linear-gradient(90deg,#3b82f6,#4ce6ff);box-shadow:0 0 8px rgba(76,230,255,.5)}
.iicp-board .iicp-card.is-blocked .iicp-card-progress i{background:linear-gradient(90deg,#ff6b8b,#ffd75e);box-shadow:0 0 8px rgba(255,107,139,.45)}
.iicp-board .iicp-card-menu{color:#5f97b9}
.iicp-board .iicp-card-menu:hover{background:rgba(76,230,255,.10);color:#eaf8ff}

/* —— 筛选 / 弹层 / 菜单 / toast —— */
.iicp-board .iicp-filter{color:#8fc7e4}
.iicp-board .iicp-filter-label{color:#5f97b9}
.iicp-board .iicp-filter select{
  border-color:rgba(76,230,255,.24);
  background-color:rgba(6,26,50,.72);
  color:#dff8ff;
  background-image:linear-gradient(45deg,transparent 50%,#8fe7ff 50%),linear-gradient(135deg,#8fe7ff 50%,transparent 50%);
}
.iicp-board .iicp-filter select:hover{background-color:rgba(76,230,255,.09)}
.iicp-board .iicp-filter select option{background:#061a34;color:#eaf8ff}
.iicp-board .iicp-popover{
  color:#eaf8ff;
  border-color:rgba(76,230,255,.34);
  background:
    radial-gradient(120% 100% at 50% 0,rgba(76,230,255,.10),transparent 55%),
    linear-gradient(180deg,rgba(8,38,71,.98),rgba(4,18,36,.98));
  box-shadow:0 18px 50px rgba(0,0,0,.50),0 0 30px rgba(38,133,255,.12);
  -webkit-backdrop-filter:blur(10px);
  backdrop-filter:blur(10px);
}
.iicp-board .iicp-pop-label{color:#7fb5d3}
.iicp-board .iicp-popover .iicp-select,
.iicp-board .iicp-pop-row select{
  border-color:rgba(76,230,255,.24);
  background-color:rgba(3,15,32,.78);
  color:#eaf8ff;
  background-image:linear-gradient(45deg,transparent 50%,#8fe7ff 50%),linear-gradient(135deg,#8fe7ff 50%,transparent 50%);
}
.iicp-board .iicp-popover .iicp-select option,
.iicp-board .iicp-pop-row select option{background:#061a34;color:#eaf8ff}
.iicp-board .iicp-pop-foot{border-top-color:rgba(76,230,255,.14)}
.iicp-board .iicp-chip{color:#8fc7e4}
.iicp-board .iicp-chip:hover{background:rgba(76,230,255,.08);color:#eaf8ff}
.iicp-board .iicp-chip.on{
  background:linear-gradient(135deg,rgba(76,230,255,.20),rgba(59,130,246,.24));
  color:#ffffff;
  box-shadow:inset 0 0 0 1px rgba(124,232,255,.30);
}
.iicp-board .iicp-clear{color:#5f97b9}
.iicp-board .iicp-clear:hover{color:#eaf8ff}
.iicp-board .iicp-menu{
  border-color:rgba(76,230,255,.34);
  background:
    radial-gradient(120% 100% at 50% 0,rgba(76,230,255,.10),transparent 55%),
    linear-gradient(180deg,rgba(8,38,71,.98),rgba(4,18,36,.98));
  box-shadow:0 18px 50px rgba(0,0,0,.50),0 0 26px rgba(38,133,255,.12);
}
.iicp-board .iicp-menu-item{color:#dff8ff}
.iicp-board .iicp-menu-item:hover{background:rgba(76,230,255,.10)}
.iicp-board .iicp-menu-item.is-danger{color:#ffadc0}
.iicp-board .iicp-menu-sep{background:rgba(76,230,255,.14)}
.iicp-board .iicp-toast{
  border:1px solid rgba(76,230,255,.30);
  background:linear-gradient(135deg,rgba(9,40,76,.96),rgba(4,20,40,.97));
  color:#dcf7ff;
  box-shadow:0 12px 36px rgba(0,0,0,.45),0 0 20px rgba(76,230,255,.12);
}
.iicp-board .iicp-loading-line{
  background:linear-gradient(90deg,rgba(76,230,255,.05),rgba(76,230,255,.22),rgba(76,230,255,.05));
}
.iicp-board .iicp-empty-state{color:#8fc7e4}
.iicp-board .iicp-error-title{color:#f4fdff}
.iicp-board .iicp-error-detail{color:#8fc7e4}
.iicp-board .iicp-note-tiny{color:#5f97b9}

/* —— 项目页 —— */
.iicp-board .iicp-projects{padding:16px 2px 26px}
.iicp-board .iicp-projects-guide{
  max-width:760px;
  padding:11px 14px;
  border-left:2px solid rgba(76,230,255,.55);
  border-radius:0 10px 10px 0;
  background:linear-gradient(90deg,rgba(76,230,255,.08),transparent 75%);
  color:#8fc7e4;
}
.iicp-board .iicp-project-section{margin-bottom:22px}
.iicp-board .iicp-project-section>h3{
  align-items:center;
  gap:9px;
  margin-bottom:11px;
  font-size:11px;
  font-weight:700;
  letter-spacing:.16em;
  text-transform:uppercase;
  color:#8fe7ff;
}
.iicp-board .iicp-project-section>h3::before{
  content:"";
  flex:none;
  width:3px;
  height:12px;
  border-radius:2px;
  background:linear-gradient(180deg,#9df6ff,#3b82f6);
  box-shadow:0 0 9px rgba(76,230,255,.8);
}
.iicp-board .iicp-project-section>h3 span{
  font-size:10px;
  font-weight:500;
  letter-spacing:.04em;
  text-transform:none;
  color:#5f97b9;
}
.iicp-board .iicp-project-grid{gap:14px}
.iicp-board .iicp-project-card{
  position:relative;
  overflow:hidden;
  gap:10px;
  padding:16px;
  border:1px solid rgba(76,230,255,.24);
  border-radius:16px;
  background:
    radial-gradient(120% 120% at 0% 0%,rgba(76,230,255,.10),transparent 52%),
    linear-gradient(180deg,rgba(9,36,68,.90),rgba(4,20,40,.94));
  box-shadow:inset 0 0 26px rgba(59,130,246,.06),0 10px 26px rgba(0,0,0,.22);
  transition:transform .2s,border-color .2s,box-shadow .2s;
}
.iicp-board .iicp-project-card::before{
  content:"";
  position:absolute;
  left:16px;
  right:16px;
  top:0;
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(76,230,255,.82),transparent);
  box-shadow:0 0 12px rgba(76,230,255,.5);
}
.iicp-board .iicp-project-card:hover{
  transform:translateY(-2px);
  border-color:rgba(124,232,255,.55);
  box-shadow:inset 0 0 30px rgba(76,230,255,.08),0 0 30px rgba(76,230,255,.12),0 14px 30px rgba(0,0,0,.30);
}
.iicp-board .iicp-project-card.is-archived{opacity:.58}
.iicp-board .iicp-project-card h4{
  font-size:16px;
  font-weight:700;
  color:#f4fdff;
  text-shadow:0 0 16px rgba(76,230,255,.22);
}
.iicp-board .iicp-project-metrics{color:#8fc7e4}
.iicp-board .iicp-project-progress{
  height:6px;
  border:1px solid rgba(76,230,255,.12);
  border-radius:99px;
  background:rgba(3,15,32,.72);
}
.iicp-board .iicp-project-progress>i{
  border-radius:99px;
  background:linear-gradient(90deg,#3b82f6,#4ce6ff);
  box-shadow:0 0 10px rgba(76,230,255,.55);
  opacity:1;
}
.iicp-board .iicp-project-due{color:#7fb5d3}
.iicp-board .iicp-project-due.is-overdue{color:#ffadc0}
.iicp-board .iicp-project-note{color:#a6d7ee}
.iicp-board .iicp-project-actions{gap:6px}
.iicp-board .iicp-project-empty{
  padding:18px;
  border:1px dashed rgba(76,230,255,.20);
  border-radius:12px;
  background:rgba(8,30,56,.30);
  color:#5f97b9;
  text-align:center;
}
.iicp-board .iicp-archive-block summary{color:#8fc7e4}
.iicp-board .iicp-archive-block[open] summary{color:#dff8ff}

/* —— 任务详情抽屉 —— */
.iicp-board .iicp-mask{
  background:rgba(1,7,18,.72);
  -webkit-backdrop-filter:blur(5px);
  backdrop-filter:blur(5px);
}
.iicp-board .iicp-drawer{
  color:#eaf8ff;
  border-left:1px solid rgba(76,230,255,.34);
  background:
    radial-gradient(100% 80% at 100% 0,rgba(76,230,255,.10),transparent 55%),
    linear-gradient(180deg,#082647,#04162f);
  box-shadow:-24px 0 70px rgba(0,0,0,.55),0 0 40px rgba(38,133,255,.12);
}
.iicp-board .iicp-drawer-head{
  border-bottom-color:rgba(76,230,255,.16);
  background:rgba(6,28,54,.72);
  -webkit-backdrop-filter:blur(8px);
  backdrop-filter:blur(8px);
}
.iicp-board .iicp-drawer-kicker{color:#5f97b9;letter-spacing:.06em}
.iicp-board .iicp-drawer-title{color:#f4fdff;text-shadow:0 0 16px rgba(76,230,255,.20)}
.iicp-board .iicp-iconbtn{color:#7fb5d3}
.iicp-board .iicp-iconbtn:hover{background:rgba(76,230,255,.10);color:#eaf8ff}
.iicp-board .iicp-drawer-sec{border-bottom-color:rgba(76,230,255,.12)}
.iicp-board .iicp-drawer-sec-title{color:#8fe7ff;letter-spacing:.08em}
.iicp-board .iicp-drawer-sec-count{color:#5f97b9}
.iicp-board .iicp-summary-line{color:#dff8ff}
.iicp-board .iicp-summary-line .iicp-muted{color:#7fb5d3}
.iicp-board .iicp-summary-line .iicp-sep{color:#4f7d9c}
.iicp-board .iicp-ov-label{color:#7fb5d3}
.iicp-board .iicp-ov-value{color:#d9f4ff}
.iicp-board .iicp-ov-value.is-empty{color:#4f7d9c}
.iicp-board .iicp-ov-value.is-overdue{color:#ffadc0}
.iicp-board .iicp-dsub{color:#c9edff}
.iicp-board .iicp-dsub:hover{background:rgba(76,230,255,.07)}
.iicp-board .iicp-dsub-box{border-color:rgba(76,230,255,.34);background:rgba(3,15,32,.55)}
.iicp-board .iicp-dsub.done .iicp-dsub-box{background:var(--iicp-hud-cyan);border-color:var(--iicp-hud-cyan);color:#04162e}
.iicp-board .iicp-dsub.done .iicp-dsub-text{color:#5f97b9}
.iicp-board .iicp-dsub-src{color:#8fe7ff;border-color:rgba(76,230,255,.24);background:rgba(76,230,255,.07)}
.iicp-board .iicp-dsub-del{color:#5f97b9}
.iicp-board .iicp-dsub-del:hover{background:rgba(76,230,255,.10);color:#eaf8ff}
.iicp-board .iicp-dart{color:#dff8ff}
.iicp-board .iicp-dart-path{color:#5f97b9}
.iicp-board .iicp-hist{color:#5f97b9}
.iicp-board .iicp-hist-note{color:#8fc7e4}
.iicp-board .iicp-drawer-foot{
  border-top-color:rgba(76,230,255,.14);
  background:rgba(6,28,54,.72);
}
.iicp-board .iicp-drawer-foot .iicp-note-tiny{color:#5f97b9}

/* —— 任务 / 项目弹窗里的补充控件 —— */
.iicp-board .iicp-seg button{
  border-color:rgba(76,230,255,.22);
  background:rgba(3,15,32,.60);
  color:#8fc7e4;
}
.iicp-board .iicp-seg button:hover{background:rgba(76,230,255,.08)}
.iicp-board .iicp-seg button.on{
  border-color:rgba(124,232,255,.55);
  background:linear-gradient(135deg,rgba(76,230,255,.20),rgba(59,130,246,.24));
  color:#ffffff;
  box-shadow:inset 0 0 0 1px rgba(124,232,255,.24),0 0 12px rgba(76,230,255,.12);
}
.iicp-board .iicp-planning{
  border-color:rgba(76,230,255,.14);
  background:rgba(3,15,32,.28);
}
.iicp-board .iicp-planning summary{color:#8fc7e4}
.iicp-board .iicp-check{color:#a6d7ee}
.iicp-board .iicp-subtask-add input{
  border-color:rgba(76,230,255,.22);
  background:rgba(3,15,32,.70);
  color:#eaf8ff;
}
.iicp-board .iicp-subtask-add input::placeholder{color:#4f7d9c}
.iicp-board .iicp-subtask-text{color:#dff8ff}
.iicp-board .iicp-subtask-text.done{color:#5f97b9}
.iicp-board .iicp-subtask-src{
  color:#8fe7ff;
  border-color:rgba(76,230,255,.22);
  background:rgba(76,230,255,.07);
}
.iicp-board .iicp-subtask-del{color:#5f97b9}
.iicp-board .iicp-subtask-del:hover{color:#ffadc0}

@media (max-width:980px){
  .iicp-board[data-view="board"] .iicp-slimbar::after,
  .iicp-board[data-view="projects"] .iicp-slimbar::after{display:none}
}
@media (max-width:760px){
  .iicp-board .iicp-columns{
    display:flex;
    gap:12px;
    overflow-x:auto;
    overflow-y:hidden;
    padding-bottom:8px;
    overscroll-behavior-x:contain;
  }
  .iicp-board .iicp-column{flex:0 0 236px;height:100%}
  .iicp-board .iicp-column.is-collapsed{flex:0 0 64px}
}
/* —— 队长会话抽屉 —— */
.iicp-agent-drawer{width:min(460px,94vw)}
.iicp-agent-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--iicp-ink-3)}
.iicp-agent-status i{width:6px;height:6px;border-radius:50%;background:var(--iicp-ink-3)}
.iicp-agent-status.is-online i{background:#22c55e}
.iicp-agent-status.is-offline i{background:var(--iicp-amber)}
.iicp-agent-body{flex:1;min-height:0;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.iicp-agent-msg{max-width:92%;padding:8px 10px;border-radius:10px;border:0.5px solid var(--iicp-line);background:var(--iicp-surface);white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.55}
.iicp-agent-msg.is-user{align-self:flex-end;background:color-mix(in srgb,var(--iicp-accent) 10%,var(--iicp-surface));border-color:color-mix(in srgb,var(--iicp-accent) 30%,var(--iicp-line))}
.iicp-agent-msg.is-assistant{align-self:flex-start}
.iicp-agent-msg.is-pending{color:var(--iicp-ink-3)}
.iicp-agent-empty{color:var(--iicp-ink-3);font-size:12px;text-align:center;padding:28px 8px}
.iicp-agent-foot{flex:none;border-top:0.5px solid var(--iicp-line-soft);padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px}
.iicp-agent-input{width:100%;min-height:64px;max-height:160px;resize:vertical;border:0.5px solid var(--iicp-line-strong);border-radius:8px;padding:8px 9px;font-size:12.5px;line-height:1.5;background:var(--iicp-surface);color:var(--iicp-ink)}
.iicp-agent-actions{display:flex;align-items:center;gap:8px}
.iicp-agent-actions .iicp-agent-hint{flex:1;min-width:0;font-size:11px;color:var(--iicp-ink-3)}
.iicp-team-tag.is-agent{background:color-mix(in srgb,#22c55e 14%,transparent);color:#15803d}
.iicp-team-tag.is-agent-queued{background:color-mix(in srgb,var(--iicp-amber) 14%,transparent);color:#b45309}
.iicp-team-tag.is-agent-off{background:color-mix(in srgb,var(--iicp-red) 12%,transparent);color:var(--iicp-red)}

/* —— 动效 —— */
@keyframes iicpHudPulse{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes iicpHudBreathe{0%,100%{box-shadow:0 0 0 4px rgba(76,230,255,.08),0 0 20px rgba(56,189,248,.40),inset 0 -8px 14px rgba(0,20,50,.35)}50%{box-shadow:0 0 0 7px rgba(76,230,255,.10),0 0 32px rgba(56,189,248,.62),inset 0 -8px 14px rgba(0,20,50,.35)}}
@keyframes iicpHudSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@media (max-width:900px){
  .iicp-board .iicp-team-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .iicp-board .iicp-team-branch{display:none}
}
@media (max-width:840px){
  .iicp-board .iicp-team-hero{grid-template-columns:minmax(0,1fr)}
  .iicp-board .iicp-team-hero-main{order:1}
  .iicp-board .iicp-team-taskview{order:2}
  .iicp-board .iicp-team-squad{order:3}
  .iicp-board .iicp-team-taskview .iicp-team-overview-list{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px 16px;
  }
  .iicp-board .iicp-team-radar{min-height:104px}
}
@media (max-width:640px){
  .iicp-board{padding-left:16px;padding-right:16px}
  .iicp-board .iicp-team-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
  .iicp-board .iicp-team-branch{display:none}
}
@media (prefers-reduced-motion:reduce){
  .iicp-board *,
  .iicp-board *::before,
  .iicp-board *::after{animation:none!important;transition:none!important}
}
`;
      document.head.appendChild(tag);
      return tag;
    }

    /* ---------------- shared hooks ---------------- */
    function useBoardState() {
      const [state, setState] = React.useState(null);
      const [error, setError] = React.useState(null);
      const reload = React.useCallback(async () => {
        try {
          const payload = await api("/state");
          setState(payload);
          setError(null);
        } catch (cause) {
          setError(String(cause?.message || cause));
        }
      }, []);
      React.useEffect(() => {
        reload();
        const timer = setInterval(reload, 8000);
        return () => clearInterval(timer);
      }, [reload]);
      return { state, error, reload };
    }

    /**
     * Model directory for the member form: providers and models the Host already
     * has configured, plus the Host default selection ("inherit the workspace").
     *
     * Fetched once per mount on purpose — `/models` walks every provider's model
     * list, which is far too expensive to join the 8s board poll. A failed read
     * degrades to `available:false` so the form can fall back to free text.
     */
    function useModelCatalog() {
      const [catalog, setCatalog] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const reload = React.useCallback(async () => {
        try {
          const payload = await api("/models");
          setCatalog({ ...payload, available: payload.available !== false });
        } catch (cause) {
          setCatalog({
            available: false,
            providers: [],
            defaultModel: null,
            error: { code: "E_MODEL_DIRECTORY", message: String(cause?.message || cause) },
          });
        } finally {
          setLoading(false);
        }
      }, []);
      React.useEffect(() => {
        reload();
      }, [reload]);
      return { catalog, loading, reload };
    }

    function useModal(initial) {
      const [modal, setModal] = React.useState(null);
      return [modal, setModal, () => setModal(null)];
    }

    function Modal({ title, onClose, children, footer, className }) {
      return React.createElement(
        "div",
        { className: "iicp-modal-backdrop", onMouseDown: (e) => e.target === e.currentTarget && onClose() },
        React.createElement(
          "div",
          { className: `iicp-modal${className ? ` ${className}` : ""}` },
          React.createElement("h2", null, title),
          React.createElement("div", { className: "iicp-modal-body" }, children),
          React.createElement("div", { className: "iicp-modal-actions" }, footer),
        ),
      );
    }

    function Field({ label, children }) {
      return React.createElement("div", { className: "iicp-field" }, React.createElement("label", null, label), children);
    }

    const STATUS_KEYS = ["backlog", "in_progress", "blocked", "done"];
    const STATUS_LABELS = { backlog: "待办", in_progress: "进行中", blocked: "受阻", done: "已完成" };
    const ROLE_LABELS = { owner: "负责人", admin: "管理员", member: "成员", guest: "访客" };
    const PRIORITY_LABELS = { P0: "P0 紧急", P1: "P1 高", P2: "P2 中", P3: "P3 低" };
    const KIND_LABELS = { lead: "队长", worker: "工作成员" };
    const MEMBER_STATUS_LABELS = { idle: "空闲", working: "工作中", blocked: "受阻中" };

    // An empty provider/model is the inherit state: the member follows the Host
    // default selection. Say so, otherwise "inherit" and "never configured"
    // both look like an empty subtitle on the team cards.
    function memberModelLabel(member) {
      if (!member) return "";
      if (member.provider && member.model) return `${member.provider}/${member.model}`;
      return member.provider || member.model || t("继承工作区");
    }

    /* ---------------- card icons / relative time ---------------- */
    function Icon({ name, size = 10 }) {
      const paths = {
        check: "M2 6.5 5 9.5 10.5 3.5",
        file: "M4 1.5h4L11 4.5v8H4zM8 1.5v3h3",
        alert: "M6.5 2 11.5 11h-10zM6.5 5.5v2.5M6.5 9.2v.4",
        user: "M6.5 6.3a2.15 2.15 0 1 0 0-4.3 2.15 2.15 0 0 0 0 4.3zM2.7 11.4c0-2 1.8-3.1 3.8-3.1s3.8 1.1 3.8 3.1",
        back: "M8 2.5 4 6.5l4 4M4 6.5h6",
        close: "M3.6 3.6l5.8 5.8M9.4 3.6l-5.8 5.8",
        chevron: "M3.5 5.2 6.5 8.2l3-3",
        chat: "M2 3.2h9v5.2H6.2L3.4 10.7V8.4H2z",
        next: "M5 2.5l4 4-4 4M9 6.5H3",
        plus: "M6.5 3v7M3 6.5h7",
        more: "M3 6.5h.01M6.5 6.5h.01M10 6.5h.01",
        filter: "M2.5 3.5h8l-3.2 3.6v3.4l-1.6-1V7.1z",
        search: "M6 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM8.6 8.6l2 2",
        wait: "M6.5 2.2a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6zM6.5 4.2v2.6l1.8 1.1",
      };
      return React.createElement(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 13 13",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
        },
        React.createElement("path", { d: paths[name] || "" }),
      );
    }

    /** ISO 时间 → 「刚刚 / N 分钟前 / N 小时前 / N 天前 / M/D」（同 super-kanban relTime）。 */
    function relTime(value) {
      const ms = typeof value === "number" ? value : Date.parse(value || "");
      if (!ms || !Number.isFinite(ms)) return "";
      const delta = Date.now() - ms;
      if (delta < 60_000) return t("刚刚");
      if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} ${t("分钟前")}`;
      if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} ${t("小时前")}`;
      if (delta < 30 * 86_400_000) return `${Math.floor(delta / 86_400_000)} ${t("天前")}`;
      const date = new Date(ms);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    /* ---------------- board helpers（v2.5：对齐 super-kanban 看板语义） ---------------- */
    const COLUMN_PAGE_SIZE = 30;
    const PRIORITY_ORDER = ["P0", "P1", "P2", "P3"];

    /** goal 可能是 v2 对象也可能是 v1 字符串，统一取文本。 */
    function goalTextOf(task) {
      const goal = task?.goal;
      if (goal && typeof goal === "object") return goal.text || "";
      return typeof goal === "string" ? goal : "";
    }

    /** 排序：置顶 → 优先级 → 最近更新（同 super-kanban compareTasks）。 */
    function compareTasks(a, b) {
      const pinned = Number(b.pinned === true) - Number(a.pinned === true);
      if (pinned) return pinned;
      const pa = PRIORITY_ORDER.indexOf(a.priority || "P3");
      const pb = PRIORITY_ORDER.indexOf(b.priority || "P3");
      const diff = (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb);
      if (diff !== 0) return diff;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    }

    /** 未完成的前置任务（缺失 id 视为未完成，但此处只返回仍存在的任务）。 */
    function blockersOf(task, byId) {
      return (task?.dependsOn || [])
        .map((id) => byId.get(id))
        .filter((dep) => dep && dep.status !== "done");
    }

    /** 客户端便利检查：把 candidateId 当前置会不会经由依赖链回到 taskId。 */
    function wouldCreateCycle(taskId, candidateId, byId) {
      if (!taskId) return false;
      const stack = [candidateId];
      const seen = new Set();
      while (stack.length > 0) {
        const id = stack.pop();
        if (id === taskId) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        const dep = byId.get(id);
        for (const next of dep?.dependsOn || []) stack.push(next);
      }
      return false;
    }

    /** 标签按使用频次排序，用于筛选下拉。 */
    function allTags(tasks) {
      const seen = new Map();
      for (const task of tasks) {
        for (const tag of task.tags || []) seen.set(tag, (seen.get(tag) || 0) + 1);
      }
      return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
    }

    /** 卡片「更多操作」浮层（固定定位，避免被列滚动裁剪）。 */
    function TaskMenu({ anchor, task, onClose, onAction }) {
      const ref = React.useRef(null);
      React.useEffect(() => {
        function onDown(event) {
          if (ref.current && ref.current.contains(event.target)) return;
          onClose();
        }
        function onKey(event) {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
        };
      }, [onClose]);
      const items = [
        { key: "open", label: t("查看详情"), action: { type: "open" } },
        { key: "pin", label: task.pinned ? t("取消置顶") : t("置顶任务"), action: { type: "pin", value: !task.pinned } },
        {
          key: "archive",
          label: task.archived ? t("恢复任务") : t("归档任务"),
          action: { type: "archive", value: !task.archived },
        },
      ];
      for (const status of STATUS_KEYS) {
        if (status === task.status) continue;
        items.push({
          key: `move-${status}`,
          label: `${t("移至")}「${t(STATUS_LABELS[status])}」`,
          action: { type: "move", value: status },
        });
      }
      items.push({ key: "delete", label: t("删除任务"), action: { type: "delete" }, danger: true });
      const style = { top: anchor.y, left: anchor.x };
      return React.createElement(
        "div",
        { className: "iicp-menu", ref, style, role: "menu" },
        items.map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: item.key },
            item.danger ? React.createElement("div", { className: "iicp-menu-sep" }, null) : null,
            React.createElement(
              "button",
              {
                type: "button",
                role: "menuitem",
                className: `iicp-menu-item${item.danger ? " is-danger" : ""}`,
                tabIndex: index === 0 ? 0 : -1,
                onClick: (event) => {
                  event.stopPropagation();
                  onAction(item.action);
                },
              },
              item.label,
            ),
          ),
        ),
      );
    }

    /* ---------------- Board view ---------------- */
    function BoardView({ state, reload, openTaskModal, openTaskDrawer, query, pushToast, leading, scope, onScopeApplied }) {
      const [assigneeFilter, setAssigneeFilter] = React.useState("");
      const [projectFilter, setProjectFilter] = React.useState("");
      const [workspaceFilter, setWorkspaceFilter] = React.useState("");
      const [priorityFilter, setPriorityFilter] = React.useState("");
      const [originFilter, setOriginFilter] = React.useState("");
      const [tagFilter, setTagFilter] = React.useState("");
      const [showArchived, setShowArchived] = React.useState(false);
      const [readyOnly, setReadyOnly] = React.useState(false);
      const [filterOpen, setFilterOpen] = React.useState(false);
      const [dragTaskId, setDragTaskId] = React.useState(null);
      const [dragOverColumn, setDragOverColumn] = React.useState(null);
      const [optimistic, setOptimistic] = React.useState({});
      const [collapsed, setCollapsed] = React.useState({});
      const [pages, setPages] = React.useState({});
      const [menu, setMenu] = React.useState(null);
      const popoverRef = React.useRef(null);

      // 从项目卡片「看板」跳进来时带入范围（项目 / 工作区），并清掉其它筛选。
      React.useEffect(() => {
        if (!scope) return;
        setAssigneeFilter("");
        setPriorityFilter("");
        setOriginFilter("");
        setTagFilter("");
        if (scope.workspaceId) {
          setWorkspaceFilter(scope.workspaceId);
          setProjectFilter("");
        } else if (scope.projectId) {
          setWorkspaceFilter("");
          setProjectFilter(scope.projectId);
        } else {
          setWorkspaceFilter("");
          setProjectFilter("");
        }
        onScopeApplied?.();
      }, [scope?.nonce]);

      React.useEffect(() => {
        if (!filterOpen) return undefined;
        function onDown(event) {
          if (popoverRef.current && popoverRef.current.contains(event.target)) return;
          setFilterOpen(false);
        }
        function onKey(event) {
          if (event.key === "Escape") setFilterOpen(false);
        }
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
        };
      }, [filterOpen]);

      const allTasks = state?.tasks || [];
      const byId = new Map(allTasks.map((task) => [task.id, task]));
      const visiblePool = allTasks.filter((task) => showArchived || !task.archived);
      // 工作区范围：任务自身带 workspaceId，或归属某个绑定了该工作区的项目。
      const workspaceProjectIds = React.useMemo(() => {
        if (!workspaceFilter) return null;
        const ids = new Set(
          (state?.projects || [])
            .filter((project) => project.workspaceId === workspaceFilter)
            .map((project) => project.id),
        );
        return ids;
      }, [state?.projects, workspaceFilter]);
      const needle = String(query || "").trim().toLowerCase();
      const filtered = visiblePool
        .map((task) => (optimistic[task.id] ? { ...task, status: optimistic[task.id] } : task))
        .filter((task) => {
          if (needle) {
            const haystack = `${task.title} ${task.acceptanceCriteria || ""} ${goalTextOf(task)} ${(task.tags || []).join(" ")}`;
            if (!haystack.toLowerCase().includes(needle)) return false;
          }
          if (assigneeFilter) {
            if (assigneeFilter === "__none__" ? Boolean(task.assigneeId) : task.assigneeId !== assigneeFilter) return false;
          }
          if (projectFilter) {
            if (projectFilter === "__none__" ? Boolean(task.projectId) : task.projectId !== projectFilter) return false;
          }
          if (workspaceFilter) {
            if (task.workspaceId !== workspaceFilter) {
              const viaProject = Boolean(task.projectId) && workspaceProjectIds?.has(task.projectId);
              if (!viaProject) return false;
            }
          }
          if (priorityFilter && task.priority !== priorityFilter) return false;
          if (originFilter && (task.origin || "manual") !== originFilter) return false;
          if (tagFilter && !(task.tags || []).includes(tagFilter)) return false;
          if (readyOnly && task.ready === false) return false;
          return true;
        })
        .sort(compareTasks);
      const activeFilterCount = [
        assigneeFilter,
        projectFilter,
        workspaceFilter,
        priorityFilter,
        originFilter,
        tagFilter,
        showArchived ? "1" : "",
        readyOnly ? "1" : "",
        needle,
      ].filter(Boolean).length;
      const tags = allTags(visiblePool);

      function clearFilters() {
        setAssigneeFilter("");
        setProjectFilter("");
        setWorkspaceFilter("");
        setPriorityFilter("");
        setOriginFilter("");
        setTagFilter("");
        setShowArchived(false);
        setReadyOnly(false);
      }

      function moveTask(task, status) {
        if (!task || task.status === status) return;
        // 本地预检只是省掉一次注定失败的乐观更新，服务端 409 仍是权威。
        if (status === "in_progress" && task.ready === false) {
          const names = blockersOf(task, byId).map((dep) => dep.title);
          pushToast?.(`${t("无法开工")}：${t("前置任务未完成")}${names.length ? `（${names.join("、")}）` : ""}`);
          return;
        }
        setOptimistic((current) => ({ ...current, [task.id]: status }));
        api("/task.move", { method: "POST", body: JSON.stringify({ id: task.id, status }) })
          .then(() => {
            pushToast?.(`${t("已移动到")}「${t(STATUS_LABELS[status])}」`);
          })
          .catch((cause) => {
            pushToast?.(`${t("移动失败")}：${cause?.message || cause}`);
          })
          .finally(() => {
            setOptimistic((current) => {
              const next = { ...current };
              delete next[task.id];
              return next;
            });
            reload();
          });
      }

      function onDrop(status) {
        setDragOverColumn(null);
        if (!dragTaskId) return;
        const task = allTasks.find((item) => item.id === dragTaskId);
        setDragTaskId(null);
        moveTask(task, status);
      }

      function runMenuAction(task, action) {
        setMenu(null);
        if (action.type === "open") {
          openTaskDrawer(task);
          return;
        }
        if (action.type === "move") {
          moveTask(task, action.value);
          return;
        }
        if (action.type === "delete") {
          if (!window.confirm(`${t("确认删除")} ${task.title}`)) return;
          api("/task.delete", { method: "POST", body: JSON.stringify({ id: task.id }) })
            .then(() => {
              pushToast?.(t("已删除任务"));
              reload();
            })
            .catch(() => reload());
          return;
        }
        const body = { id: task.id };
        if (action.type === "pin") body.pinned = action.value;
        if (action.type === "archive") body.archived = action.value;
        api("/task.update", { method: "POST", body: JSON.stringify(body) })
          .then(() => {
            pushToast?.(
              action.type === "pin"
                ? action.value
                  ? t("已置顶")
                  : t("已取消置顶")
                : action.value
                  ? t("已归档")
                  : t("已恢复"),
            );
            reload();
          })
          .catch((cause) => pushToast?.(`${t("操作失败")}：${cause?.message || cause}`));
      }

      function openMenu(event, task) {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const width = 190;
        const height = 268;
        const x = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
        const y = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8));
        setMenu({ taskId: task.id, x, y });
      }

      const selectFilter = (label, value, onChange, options) =>
        React.createElement(
          "span",
          { className: "iicp-filter" },
          React.createElement("span", { className: "iicp-filter-label" }, label),
          React.createElement(
            "select",
            { value, onChange: (event) => onChange(event.target.value) },
            options.map(([optionValue, optionLabel]) =>
              React.createElement("option", { key: optionValue || "__all__", value: optionValue }, optionLabel),
            ),
          ),
        );

      const statusChips = (current, onPick, options) =>
        React.createElement(
          "div",
          { className: "iicp-pop-chips" },
          options.map(([value, label]) =>
            React.createElement(
              "button",
              {
                key: value || "__all__",
                type: "button",
                className: `iicp-chip${current === value ? " on" : ""}`,
                "aria-pressed": current === value,
                onClick: () => onPick(value),
              },
              label,
            ),
          ),
        );

      return React.createElement(
        "div",
        { className: "iicp-view" },
        React.createElement(
          "div",
          { className: "iicp-slimbar" },
          leading || null,
          selectFilter(t("项目"), projectFilter, setProjectFilter, [
            ["", t("全部项目")],
            ["__none__", t("未归入自建项目")],
            ...(state?.projects || []).filter((p) => !p.archived).map((p) => [p.id, p.name]),
          ]),
          (state?.workspaces || []).length
            ? selectFilter(t("工作区"), workspaceFilter, setWorkspaceFilter, [
                ["", t("全部工作区")],
                ...(state?.workspaces || [])
                  .filter((workspace) => workspace.included !== false)
                  .map((workspace) => [workspace.id, workspace.title || workspace.path || workspace.id]),
              ])
            : null,
          selectFilter(t("指派给"), assigneeFilter, setAssigneeFilter, [
            ["", t("全部成员")],
            ["__none__", t("未指派")],
            ...(state?.members || []).filter((m) => !m.archived).map((m) => [m.id, m.name]),
          ]),
          React.createElement(
            "span",
            { className: "iicp-count", title: `${t("显示")} ${filtered.length} / ${allTasks.length}` },
            React.createElement("b", null, String(filtered.length)),
            ` / ${allTasks.length}`,
          ),
          React.createElement("span", { className: "iicp-slimbar-spacer" }),
          React.createElement(
            "div",
            { className: "iicp-filter-wrap", ref: popoverRef },
            React.createElement(
              "button",
              {
                type: "button",
                className: `iicp-btn${activeFilterCount ? " on" : ""}`,
                "aria-expanded": filterOpen,
                onClick: () => setFilterOpen((open) => !open),
              },
              t("筛选"),
              activeFilterCount ? React.createElement("span", { className: "iicp-filter-count" }, String(activeFilterCount)) : null,
            ),
            filterOpen
              ? React.createElement(
                  "div",
                  { className: "iicp-popover", role: "dialog", "aria-label": t("筛选") },
                  React.createElement(
                    "div",
                    { className: "iicp-pop-row" },
                    React.createElement("span", { className: "iicp-pop-label" }, t("优先级")),
                    statusChips(priorityFilter, setPriorityFilter, [
                      ["", t("全部")],
                      ...PRIORITY_ORDER.map((value) => [value, value]),
                    ]),
                  ),
                  React.createElement(
                    "div",
                    { className: "iicp-pop-row" },
                    React.createElement("span", { className: "iicp-pop-label" }, t("来源")),
                    statusChips(originFilter, setOriginFilter, [
                      ["", t("全部")],
                      ["manual", t("手动")],
                      ["session", "AI"],
                    ]),
                  ),
                  tags.length > 0
                    ? React.createElement(
                        "div",
                        { className: "iicp-pop-row" },
                        React.createElement("span", { className: "iicp-pop-label" }, t("标签")),
                        React.createElement(
                          "select",
                          { value: tagFilter, onChange: (event) => setTagFilter(event.target.value) },
                          [["", t("全部标签")], ...tags.map((tag) => [tag, `#${tag}`])].map(([value, label]) =>
                            React.createElement("option", { key: value || "__all__", value }, label),
                          ),
                        ),
                      )
                    : null,
                  React.createElement(
                    "div",
                    { className: "iicp-pop-foot" },
                    React.createElement(
                      "button",
                      {
                        type: "button",
                        className: `iicp-chip${readyOnly ? " on" : ""}`,
                        "aria-pressed": readyOnly,
                        onClick: () => setReadyOnly((value) => !value),
                      },
                      t("仅看可开工"),
                    ),
                    React.createElement(
                      "button",
                      {
                        type: "button",
                        className: `iicp-chip${showArchived ? " on" : ""}`,
                        "aria-pressed": showArchived,
                        onClick: () => setShowArchived((value) => !value),
                      },
                      t("含归档"),
                    ),
                    React.createElement(
                      "button",
                      { type: "button", className: "iicp-clear", onClick: clearFilters },
                      t("清空筛选"),
                    ),
                  ),
                )
              : null,
          ),
        ),
        React.createElement(
          "div",
          { className: "iicp-columns" },
          STATUS_KEYS.map((status) => {
            const columnTasks = filtered.filter((task) => task.status === status);
            const isCollapsed = status === "done" && collapsed.done === true;
            const pageCount = Math.max(1, Math.ceil(columnTasks.length / COLUMN_PAGE_SIZE));
            const page = Math.min(pages[status] || 0, pageCount - 1);
            const start = page * COLUMN_PAGE_SIZE;
            const pageTasks = columnTasks.slice(start, start + COLUMN_PAGE_SIZE);
            const emptyText = status === "blocked" ? t("暂无受阻任务") : t("暂无任务，拖拽卡片到这里");
            return React.createElement(
              "section",
              {
                key: status,
                className: `iicp-column${dragOverColumn === status ? " dragover" : ""}${isCollapsed ? " is-collapsed" : ""}`,
                onDragOver: (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverColumn(status);
                },
                onDragLeave: (event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setDragOverColumn(null);
                },
                onDrop: (event) => {
                  event.preventDefault();
                  onDrop(status);
                },
              },
              React.createElement(
                "header",
                { className: "iicp-column-head" },
                isCollapsed
                  ? React.createElement(
                      "button",
                      {
                        type: "button",
                        className: "iicp-col-toggle",
                        "aria-expanded": false,
                        onClick: () => setCollapsed((current) => ({ ...current, done: false })),
                      },
                      React.createElement("span", { className: `iicp-dot is-${status}` }),
                      React.createElement("span", { className: "iicp-col-title" }, t(STATUS_LABELS[status])),
                      React.createElement("span", { className: "iicp-column-count" }, String(columnTasks.length)),
                    )
                  : [
                      React.createElement("span", { key: "dot", className: `iicp-dot is-${status}` }),
                      React.createElement("span", { key: "title", className: "iicp-col-title" }, t(STATUS_LABELS[status])),
                      React.createElement("span", { key: "count", className: "iicp-column-count" }, String(columnTasks.length)),
                      React.createElement("span", { key: "spacer", className: "iicp-col-spacer" }),
                      status === "done"
                        ? React.createElement(
                            "button",
                            {
                              key: "toggle",
                              type: "button",
                              className: "iicp-col-toggle is-icon",
                              title: t("折叠已完成列"),
                              "aria-label": t("折叠已完成列"),
                              "aria-expanded": true,
                              onClick: () => setCollapsed((current) => ({ ...current, done: true })),
                            },
                            React.createElement(Icon, { name: "chevron", size: 13 }),
                          )
                        : null,
                      React.createElement(
                        "button",
                        {
                          key: "add",
                          type: "button",
                          className: "iicp-col-add",
                          title: `${t("在")}「${t(STATUS_LABELS[status])}」${t("新建")}`,
                          "aria-label": `${t("在")}「${t(STATUS_LABELS[status])}」${t("新建任务")}`,
                          onClick: () => openTaskModal(null, { status }),
                        },
                        React.createElement(Icon, { name: "plus", size: 13 }),
                      ),
                    ],
              ),
              isCollapsed
                ? null
                : React.createElement(
                    "div",
                    { className: "iicp-cards" },
                    pageTasks.length === 0
                      ? React.createElement("div", { className: "iicp-empty" }, emptyText)
                      : pageTasks.map((task) =>
                          React.createElement(TaskCard, {
                            key: task.id,
                            task,
                            blockers: blockersOf(task, byId),
                            dragging: dragTaskId === task.id,
                            onDragStart: () => setDragTaskId(task.id),
                            onDragEnd: () => {
                              setDragTaskId(null);
                              setDragOverColumn(null);
                            },
                            onOpen: () => openTaskDrawer(task),
                            onEdit: () => openTaskModal(task),
                            onMenu: (event) => openMenu(event, task),
                          }),
                        ),
                    pageCount > 1
                      ? React.createElement(
                          "nav",
                          { className: "iicp-pager", "aria-label": t("分页") },
                          React.createElement(
                            "button",
                            {
                              type: "button",
                              disabled: page <= 0,
                              "aria-label": t("上一页"),
                              onClick: () => setPages((current) => ({ ...current, [status]: page - 1 })),
                            },
                            React.createElement(Icon, { name: "back", size: 12 }),
                          ),
                          React.createElement(
                            "span",
                            { "aria-live": "polite" },
                            `${start + 1}–${Math.min(start + COLUMN_PAGE_SIZE, columnTasks.length)} / ${columnTasks.length}`,
                          ),
                          React.createElement(
                            "button",
                            {
                              type: "button",
                              disabled: page >= pageCount - 1,
                              "aria-label": t("下一页"),
                              onClick: () => setPages((current) => ({ ...current, [status]: page + 1 })),
                            },
                            React.createElement(Icon, { name: "next", size: 12 }),
                          ),
                        )
                      : null,
                  ),
            );
          }),
        ),
        menu
          ? React.createElement(TaskMenu, {
              key: menu.taskId,
              anchor: { x: menu.x, y: menu.y },
              task: allTasks.find((task) => task.id === menu.taskId) || {},
              onClose: () => setMenu(null),
              onAction: (action) => runMenuAction(allTasks.find((task) => task.id === menu.taskId), action),
            })
          : null,
      );
    }

    function TaskCard({ task, blockers = [], dragging, onDragStart, onDragEnd, onOpen, onEdit, onMenu }) {
      const subtasks = task.subtasks || [];
      const subDone = subtasks.filter((subtask) => subtask.done).length;
      const progress = typeof task.progress === "number" ? task.progress : null;
      const priority = task.priority || "P2";
      const today = new Date().toISOString().slice(0, 10);
      const overdue = Boolean(task.dueDate) && task.dueDate < today && task.status !== "done";
      const summary = task.acceptanceCriteria || goalTextOf(task);
      // 单击打开详情抽屉、双击仍进编辑弹窗。
      // 用自行计时判断「两次点击间隔」而不是 event.detail / onDoubleClick：
      // 合成点击（桌面自动化、部分触控板）常常只发两个 detail=1 的 click，不派发 dblclick。
      const clickTimer = React.useRef(null);
      const lastClickAt = React.useRef(0);
      const openRef = React.useRef(null);
      const cancelPending = () => {
        if (clickTimer.current) {
          clearTimeout(clickTimer.current);
          clickTimer.current = null;
        }
      };
      React.useEffect(() => cancelPending, []);
      const openDetail = () => {
        cancelPending();
        lastClickAt.current = 0;
        openRef.current?.focus?.({ preventScroll: true });
        onOpen();
      };
      return React.createElement(
        "article",
        {
          className: `iicp-card is-${task.status}${task.pinned ? " is-pinned" : ""}${task.archived ? " is-archived" : ""}${dragging ? " dragging" : ""}`,
          draggable: true,
          onDragStart,
          onDragEnd,
          onClick: (event) => {
            const now = Date.now();
            const isSecondClick = now - lastClickAt.current < 350;
            lastClickAt.current = now;
            if (isSecondClick) {
              cancelPending();
              lastClickAt.current = 0;
              onEdit();
              return;
            }
            cancelPending();
            clickTimer.current = setTimeout(() => {
              clickTimer.current = null;
              openRef.current?.focus?.({ preventScroll: true });
              onOpen();
            }, 350);
          },
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openDetail();
            }
          },
          role: "button",
          tabIndex: 0,
          "aria-haspopup": "dialog",
          "data-task-id": task.id,
          title: `${task.title}\n${t("单击查看详情，双击编辑")}`,
        },
        React.createElement(
          "div",
          { className: "iicp-card-head" },
          React.createElement("span", { className: `iicp-dot is-${task.status}`, title: t(STATUS_LABELS[task.status] || task.status) }),
          React.createElement(
            "h3",
            { className: "iicp-card-title" },
            React.createElement("button", { type: "button", className: "iicp-card-open", ref: openRef, tabIndex: -1 }, task.title),
          ),
          task.pinned ? React.createElement("span", { className: "iicp-mark" }, t("置顶")) : null,
          task.archived ? React.createElement("span", { className: "iicp-mark", title: t("已归档任务") }, t("已归档")) : null,
          (task.origin || "manual") === "session"
            ? React.createElement("span", { className: "iicp-ai-mark", title: t("来自 AI 会话") }, "AI")
            : null,
          React.createElement(
            "button",
            {
              type: "button",
              className: "iicp-card-menu",
              title: t("更多任务操作"),
              "aria-label": t("更多任务操作"),
              "aria-haspopup": "menu",
              onClick: onMenu,
            },
            React.createElement(Icon, { name: "more", size: 13 }),
          ),
        ),
        React.createElement(
          "div",
          { className: "iicp-card-meta" },
          React.createElement(
            "span",
            { className: "iicp-card-scope", title: task.projectName || t("未归属") },
            task.projectName || t("未归属"),
          ),
          React.createElement("span", { className: "iicp-card-sep" }, "·"),
          React.createElement("span", { className: "iicp-card-time" }, relTime(task.updatedAt) || "—"),
          React.createElement(
            "span",
            { className: "iicp-card-metrics" },
            blockers.length > 0 && task.status !== "done"
              ? React.createElement(
                  "span",
                  {
                    className: "iicp-card-metric is-waiting",
                    title: `${t("等待前置")}：${blockers.map((dep) => dep.title).join("、")}`,
                  },
                  React.createElement(Icon, { name: "wait" }),
                  `${t("等待前置")} ${blockers.length}`,
                )
              : null,
            React.createElement(
              "span",
              { className: `iicp-prio is-${priority.toLowerCase()}`, title: t("优先级") },
              priority,
            ),
            task.assigneeName
              ? React.createElement(
                  "span",
                  { className: "iicp-card-metric", title: `${t("指派给")} ${task.assigneeName}` },
                  React.createElement(Icon, { name: "user" }),
                  task.assigneeName,
                )
              : null,
            (task.artifacts || []).length > 0
              ? React.createElement(
                  "span",
                  { className: "iicp-card-metric", title: `${t("交付物")} × ${task.artifacts.length}` },
                  React.createElement(Icon, { name: "file" }),
                  String(task.artifacts.length),
                )
              : null,
            subtasks.length > 0
              ? React.createElement(
                  "span",
                  {
                    className: `iicp-card-metric${subDone === subtasks.length ? " is-done" : ""}`,
                    title: `${subDone}/${subtasks.length} ${t("子任务")}`,
                  },
                  React.createElement(Icon, { name: "check" }),
                  `${subDone}/${subtasks.length}`,
                )
              : null,
          ),
        ),
        task.dueDate || task.tags?.length
          ? React.createElement(
              "div",
              { className: "iicp-card-planning" },
              task.dueDate
                ? React.createElement(
                    "span",
                    {
                      className: `iicp-due${overdue ? " is-overdue" : ""}`,
                      title: `${t("到期日")} ${task.dueDate}`,
                    },
                    overdue ? `${t("已逾期")} · ${task.dueDate}` : task.dueDate,
                  )
                : null,
              task.tags?.length
                ? React.createElement(
                    "span",
                    { className: "iicp-card-tags" },
                    task.tags.map((tag) => React.createElement("span", { key: tag }, `#${tag}`)),
                  )
                : null,
            )
          : null,
        summary
          ? React.createElement("div", { className: "iicp-card-summary", title: summary }, summary)
          : null,
        progress !== null
          ? React.createElement(
              "div",
              { className: "iicp-card-progress", title: `${t("进度")} ${progress}%` },
              React.createElement("i", { style: { width: `${progress}%` } }),
            )
          : null,
      );
    }

    /* ---------------- task detail drawer（单击卡片打开，编辑仍走原弹窗） ---------------- */
    function fmtDate(value, emptyLabel) {
      if (!value) return emptyLabel;
      const ms = Date.parse(value);
      if (!Number.isFinite(ms)) return String(value);
      const date = new Date(ms);
      const pad = (n) => String(n).padStart(2, "0");
      return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
    }

    function fmtDateTime(value, emptyLabel) {
      if (!value) return emptyLabel;
      const ms = Date.parse(value);
      if (!Number.isFinite(ms)) return String(value);
      const date = new Date(ms);
      const pad = (n) => String(n).padStart(2, "0");
      return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function TaskDrawer({ task, members, projects, tasks, onClose, onEdit }) {
      const titleId = `iicp-drawer-title-${task.id}`;
      const goalText = task.goal && typeof task.goal === "object" ? task.goal.text || "" : task.goal || "";
      const subtasks = task.subtasks || [];
      const subDone = subtasks.filter((subtask) => subtask.done).length;
      const artifacts = task.artifacts || [];
      const history = task.history || [];
      const progress = typeof task.progress === "number" ? task.progress : null;
      const priority = task.priority || "P2";
      const member = members.find((item) => item.id === task.assigneeId);
      const project = projects.find((item) => item.id === task.projectId);
      const taskById = new Map((tasks || []).map((item) => [item.id, item]));
      const dependsOn = (task.dependsOn || []).map((id) => taskById.get(id));
      const today = new Date().toISOString().slice(0, 10);
      const overdue = Boolean(task.dueDate) && task.dueDate < today && task.status !== "done";
      const latestHistory = [...history].reverse();

      React.useEffect(() => {
        function onKeyDown(event) {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
      }, [onClose]);

      const overviewItem = (label, value, extra) =>
        React.createElement(
          "div",
          { className: `iicp-ov-item${extra === "wide" ? " is-wide" : ""}` },
          React.createElement("span", { className: "iicp-ov-label" }, label),
          React.createElement(
            "span",
            { className: `iicp-ov-value${value ? "" : " is-empty"}` },
            value || t("暂无"),
          ),
        );

      return React.createElement(
        React.Fragment,
        null,
        React.createElement("div", { className: "iicp-mask", onMouseDown: onClose }),
        React.createElement(
          "aside",
          {
            className: "iicp-drawer",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            "data-plugin": PANEL_ID,
            "data-drawer": "task-detail",
            onMouseDown: (event) => event.stopPropagation(),
          },
          React.createElement(
            "header",
            { className: "iicp-drawer-head" },
            React.createElement(
              "button",
              {
                className: "iicp-iconbtn",
                type: "button",
                title: `${t("返回")}（Esc）`,
                "aria-label": t("关闭任务详情"),
                onClick: onClose,
              },
              React.createElement(Icon, { name: "back", size: 16 }),
            ),
            React.createElement(
              "div",
              { className: "iicp-drawer-head-text" },
              React.createElement("div", { className: "iicp-drawer-kicker" }, t("任务详情")),
              React.createElement("h2", { className: "iicp-drawer-title", id: titleId }, task.title),
            ),
          ),
          React.createElement(
            "div",
            { className: "iicp-drawer-body" },
            // 概览
            React.createElement(
              "div",
              { className: "iicp-drawer-sec" },
              React.createElement(
                "div",
                { className: "iicp-drawer-sec-head" },
                React.createElement("span", { className: "iicp-drawer-sec-title" }, t("任务概览")),
              ),
              React.createElement(
                "div",
                { className: "iicp-summary-line" },
                React.createElement("span", { className: `iicp-dot is-${task.status}` }),
                React.createElement("span", { className: "iicp-summary-status" }, t(STATUS_LABELS[task.status] || task.status)),
                React.createElement("span", { className: "iicp-sep" }, "·"),
                React.createElement(
                  "span",
                  { className: `iicp-summary-prio${priority === "P0" ? " is-p0" : priority === "P1" ? " is-p1" : ""}` },
                  PRIORITY_LABELS[priority] || priority,
                ),
                progress !== null
                  ? [
                      React.createElement("span", { key: "sep", className: "iicp-sep" }, "·"),
                      React.createElement("span", { key: "p", className: "iicp-muted" }, `${t("进度")} ${progress}%`),
                    ]
                  : null,
                member
                  ? [
                      React.createElement("span", { key: "sep2", className: "iicp-sep" }, "·"),
                      React.createElement("span", { key: "m", className: "iicp-muted" }, member.name),
                    ]
                  : null,
              ),
              React.createElement(
                "div",
                { className: "iicp-ov-grid" },
                overviewItem(t("目标"), goalText, "wide"),
                overviewItem(t("验收标准"), task.acceptanceCriteria, "wide"),
                overviewItem(t("指派给"), member ? member.name : t("无指派")),
                overviewItem(t("项目"), project ? project.name : t("无项目")),
                React.createElement(
                  "div",
                  { className: "iicp-ov-item" },
                  React.createElement("span", { className: "iicp-ov-label" }, t("到期日")),
                  React.createElement(
                    "span",
                    { className: `iicp-ov-value${task.dueDate ? "" : " is-empty"}${overdue ? " is-overdue" : ""}` },
                    task.dueDate ? (overdue ? `${t("已逾期")} · ${task.dueDate}` : task.dueDate) : t("无到期日"),
                  ),
                ),
                overviewItem(t("标签"), (task.tags || []).map((tag) => `#${tag}`).join("  ")),
                overviewItem(t("备注"), task.notes, "wide"),
              ),
            ),
            // 前置任务
            React.createElement(
              "div",
              { className: "iicp-drawer-sec" },
              React.createElement(
                "div",
                { className: "iicp-drawer-sec-head" },
                React.createElement("span", { className: "iicp-drawer-sec-title" }, t("前置任务")),
                React.createElement("span", { className: "iicp-drawer-sec-count" }, String(dependsOn.length)),
              ),
              dependsOn.length === 0
                ? React.createElement("div", { className: "iicp-note-tiny" }, t("暂无前置任务，随时可以开工"))
                : React.createElement(
                    "div",
                    { className: "iicp-deps" },
                    dependsOn.map((dep, index) => {
                      if (!dep) {
                        return React.createElement(
                          "div",
                          { key: `missing-${index}`, className: "iicp-dep" },
                          React.createElement("span", { className: "iicp-dot is-backlog" }),
                          React.createElement("span", { className: "iicp-dep-title" }, t("未知前置")),
                        );
                      }
                      // 跨项目时才显示项目名；同项目内再标一次只是噪音。
                      const depProject =
                        dep.projectId && dep.projectId !== task.projectId
                          ? projects.find((item) => item.id === dep.projectId)
                          : null;
                      return React.createElement(
                        "div",
                        { key: dep.id, className: "iicp-dep" },
                        React.createElement("span", { className: `iicp-dot is-${dep.status}` }),
                        React.createElement("span", { className: "iicp-dep-title", title: dep.title }, dep.title),
                        depProject
                          ? React.createElement(
                              "span",
                              { className: "iicp-dep-project" },
                              depProject.name || t("未知项目"),
                            )
                          : null,
                        React.createElement(
                          "span",
                          { className: "iicp-dep-state" },
                          t(STATUS_LABELS[dep.status] || dep.status),
                        ),
                      );
                    }),
                  ),
            ),
            // 子任务
            React.createElement(
              "div",
              { className: "iicp-drawer-sec" },
              React.createElement(
                "div",
                { className: "iicp-drawer-sec-head" },
                React.createElement("span", { className: "iicp-drawer-sec-title" }, t("子任务")),
                React.createElement("span", { className: "iicp-drawer-sec-count" }, `${subDone}/${subtasks.length}`),
              ),
              subtasks.length === 0
                ? React.createElement("div", { className: "iicp-note-tiny" }, t("暂无子任务"))
                : React.createElement(
                    "div",
                    { className: "iicp-dsubs" },
                    subtasks.map((subtask, index) =>
                      React.createElement(
                        "div",
                        { key: subtask.id || index, className: `iicp-dsub${subtask.done ? " done" : ""}` },
                        React.createElement(
                          "span",
                          { className: "iicp-dsub-box", "aria-hidden": "true" },
                          subtask.done ? React.createElement(Icon, { name: "check", size: 9 }) : null,
                        ),
                        React.createElement("span", { className: "iicp-dsub-text" }, subtask.text),
                        subtask.source && subtask.source !== "manual"
                          ? React.createElement("span", { className: "iicp-dsub-src" }, subtask.source)
                          : null,
                      ),
                    ),
                  ),
            ),
            // 交付物
            React.createElement(
              "div",
              { className: "iicp-drawer-sec" },
              React.createElement(
                "div",
                { className: "iicp-drawer-sec-head" },
                React.createElement("span", { className: "iicp-drawer-sec-title" }, t("交付物")),
                React.createElement("span", { className: "iicp-drawer-sec-count" }, String(artifacts.length)),
              ),
              artifacts.length === 0
                ? React.createElement("div", { className: "iicp-note-tiny" }, t("暂无交付物"))
                : React.createElement(
                    "div",
                    { className: "iicp-dart-list" },
                    artifacts.map((artifact, index) =>
                      React.createElement(
                        "div",
                        { key: artifact.id || index, className: "iicp-dart" },
                        React.createElement("span", { className: "iicp-dart-name", title: artifact.path }, artifact.name),
                        React.createElement("span", { className: "iicp-dart-path", title: artifact.path }, artifact.path),
                      ),
                    ),
                  ),
            ),
            // 变更历史
            React.createElement(
              "div",
              { className: "iicp-drawer-sec" },
              React.createElement(
                "div",
                { className: "iicp-drawer-sec-head" },
                React.createElement("span", { className: "iicp-drawer-sec-title" }, t("变更历史")),
                React.createElement("span", { className: "iicp-drawer-sec-count" }, String(history.length)),
              ),
              latestHistory.length === 0
                ? React.createElement("div", { className: "iicp-note-tiny" }, t("暂无历史"))
                : React.createElement(
                    "div",
                    { className: "iicp-hist" },
                    latestHistory.map((entry, index) =>
                      React.createElement(
                        "div",
                        { key: index, className: "iicp-hist-row" },
                        React.createElement("span", { className: "iicp-hist-time" }, fmtDateTime(entry.at, "")),
                        React.createElement("span", { className: "iicp-hist-note" }, entry.note || entry.kind || ""),
                      ),
                    ),
                  ),
              React.createElement(
                "div",
                { className: "iicp-note-tiny" },
                `${t("创建时间")} ${fmtDate(task.createdAt, "—")} · ${t("更新时间")} ${fmtDate(task.updatedAt, "—")}`,
              ),
            ),
          ),
          React.createElement(
            "footer",
            { className: "iicp-drawer-foot" },
            React.createElement(
              "button",
              { className: "iicp-btn primary", type: "button", onClick: () => onEdit(task) },
              t("打开编辑"),
            ),
            React.createElement("button", { className: "iicp-btn", type: "button", onClick: onClose }, t("关闭任务详情")),
            React.createElement("div", { className: "spacer" }),
          ),
        ),
      );
    }

    /* ---------------- Members view（v0.3：队长 + 工作成员的团队视图） ---------------- */
    /** 头像占位：名字首字，中英文都合适。 */
    function memberInitial(name) {
      const text = String(name || "").trim();
      return text ? text.slice(0, 1).toUpperCase() : "?";
    }

    function MemberAvatar({ member }) {
      return React.createElement("span", { className: "iicp-team-avatar", "aria-hidden": "true" }, memberInitial(member?.name));
    }

    /** 成员状态徽标：空闲 / 工作中 / 受阻中。 */
    function MemberStatusTag({ member }) {
      const status = member?.status || "idle";
      const cls = status === "working" ? "is-working" : status === "blocked" ? "is-blocked" : "is-idle";
      return React.createElement("span", { className: `iicp-team-tag ${cls}` }, t(MEMBER_STATUS_LABELS[status] || status));
    }

    /** 派单弹窗：把一件未指派的任务交给某个工作成员。 */
    function DispatchModal({ member, tasks, onClose, reload, pushToast }) {
      const options = tasks.filter((task) => !task.archived && !task.assigneeId && task.status !== "done");
      const [taskId, setTaskId] = React.useState(options[0]?.id || "");
      const [saving, setSaving] = React.useState(false);

      async function submit() {
        if (!taskId || saving) return;
        setSaving(true);
        try {
          await api("/member.dispatch", {
            method: "POST",
            body: JSON.stringify({ taskId, memberId: member.id }),
          });
          pushToast?.(`${t("已派单")} · ${member.name}`);
          onClose();
          reload();
        } catch (cause) {
          window.alert(`${t("操作失败")}: ${cause?.message || cause}`);
          setSaving(false);
          reload();
        }
      }

      return React.createElement(
        Modal,
        {
          title: t("派单给 {0}", [member.name]),
          onClose,
          footer: [
            React.createElement("button", { key: "cancel", className: "iicp-btn", type: "button", onClick: onClose }, t("取消")),
            React.createElement(
              "button",
              { key: "save", className: "iicp-btn primary", type: "button", disabled: !taskId || saving, onClick: submit },
              saving ? `${t("保存中")}…` : t("保存"),
            ),
          ],
        },
        options.length === 0
          ? React.createElement("p", { className: "iicp-note-tiny" }, t("没有可派单的任务"))
          : React.createElement(
              Field,
              { label: t("选择任务") },
              React.createElement(
                "select",
                { value: taskId, onChange: (e) => setTaskId(e.target.value), autoFocus: true },
                options.map((task) =>
                  React.createElement("option", { key: task.id, value: task.id }, task.title),
                ),
              ),
            ),
      );
    }

    /** 验收弹窗：队长通过或要求返工，两种结果都带一句说明。 */
    function ReviewModal({ entry, lead, onClose, reload, pushToast }) {
      const [note, setNote] = React.useState(entry.note || "");
      const [saving, setSaving] = React.useState(false);

      async function decide(decision) {
        if (saving) return;
        setSaving(true);
        const body = { taskId: entry.taskId, decision, note };
        if (lead?.id) body.leadId = lead.id;
        try {
          await api("/member.review", { method: "POST", body: JSON.stringify(body) });
          pushToast?.(decision === "accepted" ? t("已通过") : t("已返工"));
          onClose();
          reload();
        } catch (cause) {
          window.alert(`${t("操作失败")}: ${cause?.message || cause}`);
          setSaving(false);
          reload();
        }
      }

      return React.createElement(
        Modal,
        {
          title: t("验收：{0}", [entry.title || t("任务")]),
          onClose,
          footer: [
            React.createElement("button", { key: "cancel", className: "iicp-btn", type: "button", onClick: onClose }, t("取消")),
            React.createElement(
              "button",
              { key: "changes", className: "iicp-btn", type: "button", disabled: saving, onClick: () => decide("changes") },
              t("要求返工"),
            ),
            React.createElement(
              "button",
              { key: "accept", className: "iicp-btn primary", type: "button", disabled: saving, onClick: () => decide("accepted") },
              t("通过并标为完成"),
            ),
          ],
        },
        React.createElement(
          "p",
          { className: "iicp-team-sub" },
          `${entry.assigneeName || t("未指派")} · ${relTime(entry.updatedAt)}`,
        ),
        entry.note
          ? React.createElement(
              "div",
              { className: "iicp-ov-item" },
              React.createElement("span", { className: "iicp-ov-label" }, t("备注")),
              React.createElement("span", { className: "iicp-ov-value" }, entry.note),
            )
          : null,
        React.createElement(
          Field,
          { label: t("验收说明") },
          React.createElement("textarea", {
            value: note,
            maxLength: 160,
            rows: 3,
            placeholder: t("写下通过的理由或要改的地方"),
            onChange: (e) => setNote(e.target.value),
            autoFocus: true,
          }),
        ),
      );
    }

    function MembersView({ state, reload, openMemberModal, leading, pushToast }) {
      const [dispatchFor, setDispatchFor] = React.useState(null);
      const [reviewEntry, setReviewEntry] = React.useState(null);
      const [rosterOpen, setRosterOpen] = React.useState(false);
      const [transcriptFor, setTranscriptFor] = React.useState(null);

      const workload = React.useMemo(() => {
        const map = new Map();
        for (const task of (state?.tasks || []).filter((task) => !task.archived)) {
          map.set(task.assigneeId, (map.get(task.assigneeId) || 0) + 1);
        }
        return map;
      }, [state?.tasks]);

      const members = (state?.members || []).filter((m) => !m.archived);
      const team = state?.team || null;
      // The server aggregate is authoritative; the local fallbacks keep the view
      // usable on an older payload (or right after an edit, before the poll).
      const lead = team?.lead || members.find((m) => m.kind === "lead") || null;
      const workerRows = team?.workers?.length
        ? team.workers
        : members.filter((m) => m.kind === "worker");
      const pendingReviews = team?.pendingReviews || [];
      const tasks = (state?.tasks || []).filter((task) => !task.archived);
      const taskFlow = STATUS_KEYS.map((status) => ({
        status,
        count: tasks.filter((task) => task.status === status).length,
      }));
      const donePct = tasks.length
        ? Math.round((taskFlow.find((item) => item.status === "done")?.count || 0) / tasks.length * 100)
        : 0;

      // Agent session badge: unavailable > running > queued. Derived from the
      // live task rows so it needs no extra endpoint.
      const agentBadge = (member) => {
        if (member.kind !== "worker") return null;
        if (member.agentState === "unavailable")
          return React.createElement("span", { className: "iicp-team-tag is-agent-off" }, t("会话不可用"));
        if (tasks.some((task) => task.assigneeId === member.id && task.agentState === "running"))
          return React.createElement("span", { className: "iicp-team-tag is-agent" }, t("执行中"));
        if (tasks.some((task) => task.assigneeId === member.id && task.agentState === "queued"))
          return React.createElement("span", { className: "iicp-team-tag is-agent-queued" }, t("排队中"));
        return null;
      };

      const memberRow = (member) =>
        React.createElement(
          "tr",
          { key: member.id },
          React.createElement(
            "td",
            null,
            React.createElement(
              "span",
              { className: "iicp-team-row-name" },
              React.createElement(
                "span",
                { className: "iicp-team-tag" },
                t(KIND_LABELS[member.kind] || "工作成员"),
              ),
              member.name,
            ),
          ),
          React.createElement("td", null, t(ROLE_LABELS[member.role] || member.role)),
          React.createElement("td", null, React.createElement(MemberStatusTag, { member })),
          React.createElement(
            "td",
            null,
            member.kind === "lead"
              ? "—"
              : members.find((m) => m.id === member.leadId)?.name || member.leadId || "",
          ),
          React.createElement("td", null, member.title),
          React.createElement("td", null, String(workload.get(member.id) || 0)),
          React.createElement(
            "td",
            null,
            React.createElement(
              "button",
              {
                className: "iicp-btn",
                type: "button",
                onClick: () => {
                  setRosterOpen(false);
                  openMemberModal(member);
                },
              },
              t("编辑"),
            ),
            // The lead is a constant member: no delete entry is rendered for it.
            member.kind === "lead"
              ? null
              : React.createElement(
                  "button",
                  {
                    className: "iicp-btn danger",
                    type: "button",
                    onClick: () => {
                      if (!window.confirm(`${t("确认删除")} ${member.name}`)) return;
                      api("/member.delete", { method: "POST", body: JSON.stringify({ id: member.id }) })
                        .then(reload)
                        .catch(() => reload());
                    },
                  },
                  t("删除"),
                ),
          ),
        );

      return React.createElement(
        "div",
        { className: "iicp-view iicp-team-view" },
        React.createElement("div", { className: "iicp-slimbar" }, leading || null),
        React.createElement(
          "div",
          { className: "iicp-team" },

          // —— 队长 + 团队总览（HUD 指挥台） ——
          React.createElement(
            "section",
            { className: "iicp-team-section iicp-team-hero" },
            React.createElement(
              "aside",
              { className: "iicp-team-overview iicp-team-taskview", "aria-label": t("任务总监") },
              React.createElement(
                "div",
                { className: "iicp-team-overview-head" },
                React.createElement("span", { className: "iicp-team-overview-kicker" }, "TASK STATUS"),
                React.createElement("h3", null, t("任务总监")),
              ),
              React.createElement(
                "div",
                { className: "iicp-team-overview-list" },
                [
                  ["is-review", pendingReviews.length, t("待验收")],
                  ["is-flight", team?.inFlight ?? 0, t("进行中")],
                  ["is-blocked", team?.blocked ?? 0, t("受阻")],
                  ["is-unassigned", team?.unassigned ?? 0, t("未指派")],
                ].map(([cls, value, label], index) =>
                  React.createElement(
                    "span",
                    { key: index, className: cls },
                    React.createElement("i", { "aria-hidden": "true" }),
                    React.createElement("b", null, String(value)),
                    label,
                  ),
                ),
              ),
              React.createElement(
                "div",
                { className: "iicp-team-taskflow" },
                React.createElement(
                  "div",
                  { className: "iicp-team-taskflow-head" },
                  React.createElement("span", null, "TASK FLOW"),
                  React.createElement("b", null, `${donePct}%`),
                ),
                React.createElement(
                  "div",
                  { className: "iicp-team-taskflow-bar", "aria-hidden": "true" },
                  taskFlow.map((item) =>
                    React.createElement("i", {
                      key: item.status,
                      className: `is-${item.status}`,
                      style: { width: `${tasks.length ? item.count / tasks.length * 100 : 0}%` },
                    }),
                  ),
                ),
                React.createElement(
                  "div",
                  { className: "iicp-team-taskflow-foot" },
                  React.createElement("span", null, `${t("任务总数")} ${tasks.length}`),
                  React.createElement(
                    "span",
                    null,
                    `${t("已完成")} ${taskFlow.find((item) => item.status === "done")?.count || 0}`,
                  ),
                ),
              ),
            ),
            React.createElement(
              "div",
              { className: "iicp-team-hero-main" },
              React.createElement(
                "div",
                { className: "iicp-team-hero-heading" },
                React.createElement("h3", null, t("队长"), React.createElement("span", null, t("做的人不验收"))),
                React.createElement("span", { className: "iicp-team-kicker" }, "TEAM LEAD"),
              ),
              lead
                ? React.createElement(
                    "article",
                    { className: "iicp-team-lead", "data-status": lead.status || "idle" },
                    React.createElement(
                      "div",
                      { className: "iicp-team-lead-head" },
                      React.createElement(MemberAvatar, { member: lead }),
                      React.createElement(
                        "div",
                        { className: "iicp-team-id" },
                        React.createElement("h4", { className: "iicp-team-name" }, lead.name),
                        React.createElement(
                          "span",
                          { className: "iicp-team-sub" },
                          [lead.title, memberModelLabel(lead)].filter(Boolean).join(" · ") || t("队长"),
                        ),
                      ),
                      React.createElement(
                        "div",
                        { className: "iicp-team-lead-tags" },
                        React.createElement(MemberStatusTag, { member: lead }),
                        React.createElement("span", { className: "iicp-team-crown" }, `${lead.workerCount ?? 0} ${t("门下")}`),
                      ),
                    ),
                    lead.personality
                      ? React.createElement("p", { className: "iicp-team-bio" }, lead.personality)
                      : null,
                    lead.skills?.length
                      ? React.createElement(
                          "div",
                          { className: "iicp-team-skills" },
                          lead.skills.map((skill) => React.createElement("span", { key: skill, className: "iicp-team-skill" }, skill)),
                        )
                      : null,
                    React.createElement(
                      "div",
                      { className: "iicp-team-card-actions" },
                      React.createElement(
                        "button",
                        { className: "iicp-btn primary", type: "button", onClick: () => openMemberModal(null) },
                        React.createElement(Icon, { name: "plus", size: 12 }),
                        t("新增成员"),
                      ),
                      React.createElement(
                        "span",
                        { className: "iicp-team-card-actions-spacer" },
                      ),
                      React.createElement("button", { className: "iicp-btn", type: "button", onClick: () => openMemberModal(lead) }, t("编辑")),
                    ),
                  )
                : null,
            ),
            React.createElement(
              "aside",
              { className: "iicp-team-overview iicp-team-squad", "aria-label": t("团队总览") },
              React.createElement(
                "div",
                { className: "iicp-team-overview-head" },
                React.createElement("span", { className: "iicp-team-overview-kicker" }, "SQUAD STATUS"),
                React.createElement(
                  "div",
                  { className: "iicp-team-overview-title" },
                  React.createElement("h3", null, t("团队总览")),
                  React.createElement(
                    "button",
                    { className: "iicp-team-roster-link", type: "button", onClick: () => setRosterOpen(true) },
                    t("全部成员"),
                    React.createElement("b", null, members.length),
                  ),
                ),
              ),
              React.createElement(
                "div",
                { className: "iicp-team-overview-list" },
                [
                  [workerRows.length, t("工作成员")],
                  [team?.inFlight ?? 0, t("进行中")],
                  [pendingReviews.length, t("待验收")],
                  [team?.blocked ?? 0, t("受阻")],
                ].map(([value, label], index) =>
                  React.createElement(
                    "span",
                    { key: index },
                    React.createElement("i", { "aria-hidden": "true" }),
                    React.createElement("b", null, String(value)),
                    label,
                  ),
                ),
              ),
              React.createElement(
                "div",
                { className: "iicp-team-radar", "aria-hidden": "true" },
                React.createElement("span", { className: "iicp-team-radar-ring" }),
                React.createElement("span", { className: "iicp-team-radar-ring" }),
                React.createElement("span", { className: "iicp-team-radar-core" }, memberInitial(lead?.name)),
                workerRows.slice(0, 3).map((worker, index) =>
                  React.createElement(
                    "span",
                    { key: worker.id, className: `iicp-team-radar-node n${index + 1}` },
                    memberInitial(worker.name),
                  ),
                ),
              ),
            ),
          ),

          // —— 待验收队列 ——
          React.createElement(
            "section",
            { className: "iicp-team-section iicp-team-reviews" },
            React.createElement(
              "h3",
              null,
              t("待验收"),
              React.createElement("span", null, pendingReviews.length ? `${pendingReviews.length} ${t("项")}` : ""),
            ),
            pendingReviews.length === 0
              ? React.createElement("p", { className: "iicp-team-empty" }, t("暂无待验收"))
              : React.createElement(
                  "div",
                  { className: "iicp-review-list" },
                  pendingReviews.map((entry) =>
                    React.createElement(
                      "div",
                      { key: entry.taskId, className: "iicp-review-row" },
                      React.createElement(
                        "div",
                        { className: "iicp-review-head" },
                        React.createElement("span", { className: "iicp-review-title" }, entry.title),
                        React.createElement(
                          "span",
                          { className: "iicp-review-by" },
                          `${entry.assigneeName || t("未指派")} · ${relTime(entry.updatedAt)}`,
                        ),
                      ),
                      entry.note ? React.createElement("p", { className: "iicp-review-note" }, entry.note) : null,
                      React.createElement(
                        "div",
                        { className: "iicp-review-actions" },
                        React.createElement(
                          "button",
                          { className: "iicp-btn primary", type: "button", onClick: () => setReviewEntry(entry) },
                          t("验收"),
                        ),
                      ),
                    ),
                  ),
                ),
          ),

          // —— 工作成员 ——
          React.createElement(
            "div",
            { className: "iicp-team-branch", "aria-hidden": "true" },
            [0, 1, 2, 3].map((index) => React.createElement("i", { key: index })),
          ),
          React.createElement(
            "section",
            { className: "iicp-team-section iicp-team-workers" },
            React.createElement(
              "h3",
              null,
              t("工作成员"),
              React.createElement("span", null, workerRows.length ? `${workerRows.length}` : ""),
            ),
            workerRows.length === 0
              ? React.createElement(
                  "p",
                  { className: "iicp-team-empty" },
                  t("还没有工作成员。点「新建成员」即可加入团队，新成员自动挂到队长名下。"),
                )
              : React.createElement(
                  "div",
                  { className: "iicp-team-grid" },
                  workerRows.map((worker) =>
                    React.createElement(
                      "article",
                      {
                        key: worker.id,
                        className: "iicp-team-card",
                        "data-status": worker.status || "idle",
                      },
                      React.createElement(
                        "div",
                        { className: "iicp-team-card-head" },
                        React.createElement(MemberAvatar, { member: worker }),
                        React.createElement(
                          "div",
                          { className: "iicp-team-id" },
                          React.createElement("h4", { className: "iicp-team-name" }, worker.name),
                          React.createElement(
                            "span",
                            { className: "iicp-team-sub" },
                            [worker.title, memberModelLabel(worker)]
                              .filter(Boolean)
                              .join(" · ") || t("工作成员"),
                          ),
                        ),
                        worker.awaitingReview
                          ? React.createElement("span", { className: "iicp-team-tag is-review" }, `${t("待验收")} ${worker.awaitingReview}`)
                          : React.createElement(MemberStatusTag, { member: worker }),
                        agentBadge(worker),
                      ),
                      worker.skills?.length
                        ? React.createElement(
                            "div",
                            { className: "iicp-team-skills" },
                            worker.skills.map((skill) => React.createElement("span", { key: skill, className: "iicp-team-skill" }, skill)),
                          )
                        : null,
                      React.createElement(
                        "div",
                        { className: "iicp-team-metrics" },
                        React.createElement("span", null, t("任务数"), " ", React.createElement("b", null, String(worker.taskTotal ?? 0))),
                        React.createElement("span", null, t("进行中数"), " ", React.createElement("b", null, String(worker.inFlight ?? 0))),
                        React.createElement("span", null, t("受阻数"), " ", React.createElement("b", null, String(worker.blocked ?? 0))),
                      ),
                      React.createElement(
                        "div",
                        { className: "iicp-team-card-actions" },
                        React.createElement("button", { className: "iicp-btn", type: "button", onClick: () => setDispatchFor(worker) }, t("派单")),
                        React.createElement("button", { className: "iicp-btn", type: "button", onClick: () => setTranscriptFor(worker) }, t("会话")),
                        React.createElement("button", { className: "iicp-btn", type: "button", onClick: () => openMemberModal(worker) }, t("编辑")),
                      ),
                    ),
                  ),
                ),
          ),
        ),

        rosterOpen
          ? React.createElement(
              Modal,
              {
                key: "member-roster",
                title: `${t("全部成员")} · ${members.length}`,
                className: "iicp-roster-modal",
                onClose: () => setRosterOpen(false),
                footer: React.createElement(
                  "button",
                  { className: "iicp-btn", type: "button", onClick: () => setRosterOpen(false) },
                  t("关闭"),
                ),
              },
              React.createElement(
                "div",
                { className: "iicp-roster-scroll" },
                React.createElement(
                  "table",
                  { className: "iicp-table iicp-roster-table" },
                  React.createElement(
                    "thead",
                    null,
                    React.createElement(
                      "tr",
                      null,
                      [t("名称"), t("角色"), t("成员状态"), t("队长"), t("职位"), t("任务"), ""].map((head, index) =>
                        React.createElement("th", { key: index }, head),
                      ),
                    ),
                  ),
                  React.createElement(
                    "tbody",
                    null,
                    members.length === 0
                      ? React.createElement("tr", null, React.createElement("td", { colSpan: 7, className: "iicp-empty" }, "—"))
                      : members.map(memberRow),
                  ),
                ),
              ),
            )
          : null,

        reviewEntry
          ? React.createElement(ReviewModal, {
              key: reviewEntry.taskId,
              entry: reviewEntry,
              lead,
              onClose: () => setReviewEntry(null),
              reload,
              pushToast,
            })
          : null,
        dispatchFor
          ? React.createElement(DispatchModal, {
              key: dispatchFor.id,
              member: dispatchFor,
              tasks,
              onClose: () => setDispatchFor(null),
              reload,
              pushToast,
            })
          : null,
        transcriptFor
          ? React.createElement(TranscriptModal, {
              key: transcriptFor.id,
              member: transcriptFor,
              onClose: () => setTranscriptFor(null),
            })
          : null,
      );
    }

    /* ---------------- Projects view ---------------- */
    /** 项目统计：一次遍历算完，避免卡片里反复 filter。 */
    function projectStats(tasks, key, id) {
      const group = tasks.filter((task) => !task.archived && task[key] === id);
      const total = group.length;
      const done = group.filter((task) => task.status === "done").length;
      const blocked = group.filter((task) => task.status === "blocked").length;
      const inProgress = group.filter((task) => task.status === "in_progress").length;
      const today = new Date().toISOString().slice(0, 10);
      const overdue = group.filter((task) => task.status !== "done" && task.dueDate && task.dueDate < today).length;
      return { total, done, blocked, inProgress, overdue };
    }

    /** 项目卡片（对齐 super-kanban sk-project-card）：指标 + 完成度 + 到期日 + 备注 + 操作。 */
    function ProjectCard({ project, stats, isWorkspace, onBoard, onEdit, onArchive, onDelete }) {
      const today = new Date().toISOString().slice(0, 10);
      const overdue = Boolean(project.dueDate) && project.dueDate < today && stats.done < stats.total;
      const parts = [
        stats.total ? `${t("近期")} ${stats.done}/${stats.total} ${t("已完成")}` : t("暂无近期任务"),
        stats.blocked ? `${stats.blocked} ${t("项受阻")}` : "",
        stats.overdue ? `${stats.overdue} ${t("项逾期")}` : "",
        stats.inProgress ? `${stats.inProgress} ${t("项进行中")}` : "",
      ].filter(Boolean);
      return React.createElement(
        "article",
        { className: `iicp-project-card${project.archived ? " is-archived" : ""}` },
        React.createElement("h4", null, project.name),
        React.createElement("p", { className: "iicp-project-metrics" }, parts.join(" · ")),
        stats.total
          ? React.createElement(
              "div",
              {
                className: "iicp-project-progress",
                role: "progressbar",
                "aria-label": `${project.name} ${t("完成进度")}`,
                "aria-valuenow": stats.done,
                "aria-valuemin": 0,
                "aria-valuemax": stats.total,
                title: `${stats.done} / ${stats.total}`,
              },
              React.createElement("i", { style: { width: `${Math.round((stats.done / stats.total) * 100)}%` } }),
            )
          : null,
        project.dueDate
          ? React.createElement(
              "p",
              { className: `iicp-project-due${overdue ? " is-overdue" : ""}` },
              overdue
                ? `${t("已逾期")} · ${project.dueDate}`
                : `${t("到期")} ${project.dueDate}`,
            )
          : null,
        project.notes ? React.createElement("p", { className: "iicp-project-note" }, project.notes) : null,
        React.createElement(
          "div",
          { className: "iicp-project-actions" },
          React.createElement(
            "button",
            { type: "button", className: "iicp-btn", onClick: () => onBoard(project.id, isWorkspace) },
            t("看板"),
          ),
          isWorkspace
            ? null
            : React.createElement(
                "button",
                { type: "button", className: "iicp-btn", onClick: () => onEdit(project) },
                t("编辑"),
              ),
          isWorkspace
            ? null
            : React.createElement(
                "button",
                { type: "button", className: "iicp-btn", onClick: () => onArchive(project) },
                project.archived ? t("恢复") : t("归档"),
              ),
          isWorkspace
            ? null
            : React.createElement(
                "button",
                { type: "button", className: "iicp-btn danger", onClick: () => onDelete(project) },
                t("删除"),
              ),
        ),
      );
    }

    function ProjectsView({ state, reload, openProjectModal, onBoard, pushToast, leading }) {
      const tasks = state?.tasks || [];
      const projects = state?.projects || [];
      const workspaces = (state?.workspaces || []).filter((workspace) => workspace.included !== false);
      const custom = projects.filter((project) => !project.archived);
      const archived = projects.filter((project) => project.archived);

      function toggleArchive(project) {
        api("/project.update", { method: "POST", body: JSON.stringify({ id: project.id, archived: !project.archived }) })
          .then(() => {
            pushToast?.(project.archived ? t("项目已恢复") : t("项目已归档"));
            reload();
          })
          .catch((cause) => pushToast?.(`${t("操作失败")}：${cause?.message || cause}`));
      }

      function removeProject(project) {
        if (!window.confirm(`${t("确认删除")} ${project.name}？${t("项目内任务会变为未归属")}`)) return;
        api("/project.delete", { method: "POST", body: JSON.stringify({ id: project.id }) })
          .then(() => {
            pushToast?.(t("项目已删除"));
            reload();
          })
          .catch((cause) => pushToast?.(`${t("操作失败")}：${cause?.message || cause}`));
      }

      const card = (project, isWorkspace = false) =>
        React.createElement(ProjectCard, {
          key: project.id,
          project,
          isWorkspace,
          stats: projectStats(tasks, isWorkspace ? "workspaceId" : "projectId", project.id),
          onBoard,
          onEdit: openProjectModal,
          onArchive: toggleArchive,
          onDelete: removeProject,
        });

      return React.createElement(
        "div",
        { className: "iicp-view" },
        React.createElement("div", { className: "iicp-slimbar" }, leading || null),
        React.createElement(
          "div",
          { className: "iicp-projects" },
          React.createElement(
            "p",
            { className: "iicp-projects-guide" },
            t("工作区来自 DSH 的工作目录，会自动出现；自建项目由你创建，可以把不同工作区的任务归到一起。"),
          ),
          workspaces.length
            ? React.createElement(
                "section",
                { className: "iicp-project-section" },
                React.createElement("h3", null, t("工作区项目"), React.createElement("span", null, t("按 DSH 工作区自动生成"))),
                React.createElement(
                  "div",
                  { className: "iicp-project-grid" },
                  workspaces.map((workspace) =>
                    card({ id: workspace.id, name: workspace.title || workspace.path || workspace.id }, true),
                  ),
                ),
              )
            : null,
          React.createElement(
            "section",
            { className: "iicp-project-section" },
            React.createElement("h3", null, t("自建项目"), React.createElement("span", null, t("手动创建，可跨工作区"))),
            custom.length
              ? React.createElement("div", { className: "iicp-project-grid" }, custom.map((project) => card(project)))
              : React.createElement("p", { className: "iicp-project-empty" }, t("还没有自建项目。点右上角「新建项目」把一个或多个工作区的任务归到一起。")),
          ),
          archived.length
            ? React.createElement(
                "details",
                { className: "iicp-archive-block" },
                React.createElement("summary", null, `${t("已归档项目")}（${archived.length}）`),
                React.createElement("div", { className: "iicp-project-grid" }, archived.map((project) => card(project))),
              )
            : null,
        ),
      );
    }

    /* ---------------- Modals ---------------- */
    function TaskModal({ initial, state, onClose, reload, preset }) {
      const seed = preset || {};
      const [title, setTitle] = React.useState(initial?.title || "");
      const [goal, setGoal] = React.useState(
        initial?.goal && typeof initial.goal === "object" ? initial.goal.text || "" : initial?.goal || "",
      );
      const [acceptanceCriteria, setAcceptanceCriteria] = React.useState(initial?.acceptanceCriteria || "");
      const [notes, setNotes] = React.useState(initial?.notes || "");
      const [dueDate, setDueDate] = React.useState(initial?.dueDate || "");
      const [status, setStatus] = React.useState(initial?.status || seed.status || "backlog");
      const [priority, setPriority] = React.useState(initial?.priority || "P2");
      const [assigneeId, setAssigneeId] = React.useState(initial?.assigneeId || "");
      const [projectId, setProjectId] = React.useState(initial?.projectId || "");
      const [tags, setTags] = React.useState((initial?.tags || []).join(", "));
      const [subtasks, setSubtasks] = React.useState(
        (initial?.subtasks || []).map((subtask) => ({ ...subtask })),
      );
      const [newSubtask, setNewSubtask] = React.useState("");
      const [dependsOn, setDependsOn] = React.useState((initial?.dependsOn || []).slice());
      const [depPicker, setDepPicker] = React.useState("");
      const [artifacts, setArtifacts] = React.useState(
        (initial?.artifacts || []).map((artifact) => ({ ...artifact })),
      );
      const [newArtifact, setNewArtifact] = React.useState("");
      const [saving, setSaving] = React.useState(false);
      const members = (state?.members || []).filter((m) => !m.archived);
      const projects = (state?.projects || []).filter((p) => !p.archived);
      const subtasksLocked = (initial?.lockedFields || []).includes("subtasks");
      const taskById = new Map((state?.tasks || []).map((task) => [task.id, task]));
      const depCandidates = (state?.tasks || [])
        .filter((task) => task.id !== initial?.id)
        .filter((task) => !dependsOn.includes(task.id))
        .filter((task) => !wouldCreateCycle(initial?.id, task.id, taskById));

      function addDependency() {
        if (!depPicker) return;
        setDependsOn((list) => (list.includes(depPicker) ? list : [...list, depPicker].slice(0, 8)));
        setDepPicker("");
      }
      function removeDependency(id) {
        setDependsOn((list) => list.filter((item) => item !== id));
      }

      function toggleSubtask(index) {
        setSubtasks((list) => list.map((item, i) => (i === index ? { ...item, done: !item.done } : item)));
      }
      function removeSubtask(index) {
        setSubtasks((list) => list.filter((_, i) => i !== index));
      }
      function addSubtask() {
        const text = newSubtask.trim();
        if (!text) return;
        setSubtasks((list) => [...list, { text, done: false, source: "manual" }]);
        setNewSubtask("");
      }
      function addArtifact() {
        const path = newArtifact.trim();
        if (!path) return;
        setArtifacts((list) => [
          ...list,
          { name: path.split(/[\\/]/).pop() || path, path, kind: "deliverable", time: Date.now() },
        ]);
        setNewArtifact("");
      }

      async function submit() {
        if (!title.trim() || saving) return;
        setSaving(true);
        try {
          const body = {
            title,
            goal,
            acceptanceCriteria,
            notes,
            dueDate,
            status,
            priority,
            assigneeId,
            projectId,
            tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
            dependsOn,
            subtasks,
            artifacts,
          };
          if (initial) {
            await api("/task.update", { method: "POST", body: JSON.stringify({ id: initial.id, ...body }) });
          } else {
            await api("/task.create", { method: "POST", body: JSON.stringify(body) });
          }
          onClose();
          reload();
        } catch (cause) {
          window.alert(`${t("保存失败")}: ${cause?.message || cause}`);
          setSaving(false);
        }
      }

      return React.createElement(
        Modal,
        {
          title: initial ? t("编辑") : t("新建任务"),
          onClose,
          footer: [
            React.createElement("button", { key: "cancel", className: "iicp-btn", onClick: onClose }, t("取消")),
            React.createElement(
              "button",
              {
                key: "save",
                className: "iicp-btn primary",
                onClick: submit,
                disabled: !title.trim() || saving,
              },
              saving ? t("保存中…") : t("保存"),
            ),
          ],
        },
        React.createElement(Field, { label: t("标题") },
          React.createElement("input", {
            value: title, maxLength: 80, placeholder: t("要做什么？"), autoFocus: true,
            onChange: (e) => setTitle(e.target.value),
            onKeyDown: (e) => e.key === "Enter" && submit(),
          })),
        React.createElement(Field, { label: `${t("目标")}（${t("可选")}）` },
          React.createElement("textarea", { value: goal, maxLength: 280, rows: 2, placeholder: t("这项任务要实现什么？"), onChange: (e) => setGoal(e.target.value) })),
        React.createElement(Field, { label: `${t("验收标准")}（${t("可选")}，≤600 字）` },
          React.createElement("textarea", { value: acceptanceCriteria, maxLength: 600, rows: 3, placeholder: t("写下可检查的结果或验证步骤"), onChange: (e) => setAcceptanceCriteria(e.target.value) })),
        React.createElement(
          "details",
          { className: "iicp-planning", open: Boolean(initial?.projectId) || Boolean(initial?.notes) || Boolean(initial?.dueDate) || undefined },
          React.createElement("summary", null, `${t("项目")}、${t("到期日")}与${t("备注")}`),
          React.createElement(
            "div",
            { className: "iicp-field-row" },
            React.createElement(Field, { label: t("指派给") },
              React.createElement(
                "select",
                { value: assigneeId, onChange: (e) => setAssigneeId(e.target.value) },
                React.createElement("option", { value: "" }, t("未指派")),
                members.map((m) => React.createElement("option", { key: m.id, value: m.id }, `${m.name}（${t(ROLE_LABELS[m.role] || m.role)}）`)),
              )),
            React.createElement(Field, { label: t("到期日") },
              React.createElement("input", { type: "date", value: dueDate, onChange: (e) => setDueDate(e.target.value) })),
          ),
          React.createElement(Field, { label: t("项目") },
            React.createElement(
              "select",
              { value: projectId, onChange: (e) => setProjectId(e.target.value) },
              React.createElement("option", { value: "" }, t("未归属")),
              projects.map((p) => React.createElement("option", { key: p.id, value: p.id }, p.name)),
            )),
          React.createElement(Field, { label: `${t("标签")}（逗号分隔）` },
            React.createElement("input", { value: tags, onChange: (e) => setTags(e.target.value) })),
          React.createElement(Field, { label: t("备注") },
            React.createElement("textarea", { value: notes, maxLength: 280, rows: 3, placeholder: t("记录决策、背景或提醒"), onChange: (e) => setNotes(e.target.value) })),
        ),
        React.createElement(
          "div",
          { className: "iicp-field-row" },
          React.createElement(Field, { label: t("状态") },
            React.createElement(
              "div",
              { className: "iicp-seg", role: "group" },
              STATUS_KEYS.map((key) =>
                React.createElement(
                  "button",
                  { key, type: "button", "aria-pressed": status === key, className: status === key ? "on" : "", onClick: () => setStatus(key) },
                  t(STATUS_LABELS[key]),
                ),
              ),
            )),
          React.createElement(Field, { label: t("优先级") },
            React.createElement(
              "div",
              { className: "iicp-seg", role: "group" },
              Object.keys(PRIORITY_LABELS).map((value) =>
                React.createElement(
                  "button",
                  { key: value, type: "button", "aria-pressed": priority === value, className: priority === value ? "on" : "", onClick: () => setPriority(value) },
                  value,
                ),
              ),
            )),
        ),
        React.createElement(
          Field,
          { label: `${t("前置任务")}（${dependsOn.length}/8）` },
          dependsOn.length === 0
            ? React.createElement("div", { className: "iicp-note-tiny" }, t("暂无前置任务，随时可以开工"))
            : React.createElement(
                "div",
                { className: "iicp-dep-chips" },
                dependsOn.map((id) => {
                  const dep = taskById.get(id);
                  return React.createElement(
                    "span",
                    { key: id, className: "iicp-dep-chip", title: dep?.title || t("未知前置") },
                    React.createElement("span", { className: `iicp-dot is-${dep?.status || "backlog"}` }),
                    React.createElement("span", { className: "iicp-dep-title" }, dep?.title || id),
                    dep
                      ? React.createElement(
                          "span",
                          { className: "iicp-dep-state" },
                          t(STATUS_LABELS[dep.status] || dep.status),
                        )
                      : null,
                    React.createElement(
                      "button",
                      { type: "button", title: t("移除前置"), "aria-label": t("移除前置"), onClick: () => removeDependency(id) },
                      "×",
                    ),
                  );
                }),
              ),
          React.createElement(
            "div",
            { className: "iicp-dep-picker" },
            React.createElement(
              "select",
              {
                value: depPicker,
                onChange: (event) => setDepPicker(event.target.value),
                disabled: dependsOn.length >= 8,
              },
              React.createElement("option", { value: "" }, t("选择前置任务…")),
              depCandidates.map((task) =>
                React.createElement(
                  "option",
                  { key: task.id, value: task.id },
                  `${task.title}（${t(STATUS_LABELS[task.status] || task.status)}）`,
                ),
              ),
            ),
            React.createElement(
              "button",
              { type: "button", className: "iicp-btn", disabled: !depPicker || dependsOn.length >= 8, onClick: addDependency },
              t("添加"),
            ),
          ),
        ),
        React.createElement(
          Field,
          { label: `${t("子任务")}（${subtasks.filter((s) => s.done).length}/${subtasks.length}）` },
          React.createElement(
            "div",
            { className: "iicp-subtask-list" },
            subtasks.map((subtask, index) =>
              React.createElement(
                "div",
                { key: index, className: "iicp-subtask" },
                React.createElement("input", {
                  type: "checkbox",
                  checked: subtask.done === true,
                  onChange: () => toggleSubtask(index),
                }),
                React.createElement("span", { className: subtask.done ? "iicp-subtask-text done" : "iicp-subtask-text" },
                  subtask.source === "manual" ? subtask.text : `${subtask.text}`),
                subtask.source && subtask.source !== "manual"
                  ? React.createElement("span", { className: "iicp-subtask-src" }, subtask.source)
                  : null,
                React.createElement("button", { className: "iicp-subtask-del", onClick: () => removeSubtask(index) }, "×"),
              ),
            ),
            subtasksLocked ? React.createElement("div", { className: "iicp-empty" }, "🔒 子任务已锁定") : null,
            React.createElement(
              "div",
              { className: "iicp-subtask-add" },
              React.createElement("input", {
                value: newSubtask,
                placeholder: t("添加子任务"),
                maxLength: 60,
                onChange: (e) => setNewSubtask(e.target.value),
                onKeyDown: (e) => e.key === "Enter" && addSubtask(),
              }),
              React.createElement("button", { className: "iicp-btn", onClick: addSubtask }, "+"),
            ),
          ),
        ),
        React.createElement(
          Field,
          { label: `${t("交付物")}（${artifacts.length}）` },
          React.createElement(
            "div",
            { className: "iicp-subtask-list" },
            artifacts.map((artifact, index) =>
              React.createElement(
                "div",
                { key: index, className: "iicp-subtask" },
                React.createElement("span", { className: "iicp-subtask-text", title: artifact.path },
                  `📎 ${artifact.name}`),
                React.createElement("button", {
                  className: "iicp-subtask-del",
                  onClick: () => setArtifacts((list) => list.filter((_, i) => i !== index)),
                }, "×"),
              ),
            ),
            React.createElement(
              "div",
              { className: "iicp-subtask-add" },
              React.createElement("input", {
                value: newArtifact,
                placeholder: "文件路径，如 docs/report.md",
                maxLength: 260,
                onChange: (e) => setNewArtifact(e.target.value),
                onKeyDown: (e) => e.key === "Enter" && addArtifact(),
              }),
              React.createElement("button", { className: "iicp-btn", onClick: addArtifact }, "+"),
            ),
          ),
        ),
      );
    }

    function MemberModal({ initial, state, onClose, reload }) {
      const [name, setName] = React.useState(initial?.name || "");
      const [role, setRole] = React.useState(initial?.role || "member");
      const [leadId, setLeadId] = React.useState(initial?.leadId || "");
      const [title, setTitle] = React.useState(initial?.title || "");
      const [contact, setContact] = React.useState(initial?.contact || "");
      const [personality, setPersonality] = React.useState(initial?.personality || "");
      const [skills, setSkills] = React.useState((initial?.skills || []).join("，"));
      const [provider, setProvider] = React.useState(initial?.provider || "");
      const [model, setModel] = React.useState(initial?.model || "");
      const [status, setStatus] = React.useState(initial?.status || "idle");
      const [saving, setSaving] = React.useState(false);
      const { catalog, loading: catalogLoading } = useModelCatalog();

      const members = (state?.members || []).filter((m) => !m.archived);
      // The member type is a server-side constant (the lead can neither be
      // deleted nor demoted), so the modal never edits kind: creation lets the
      // server derive it, editing echoes back the stored kind untouched.
      const kindValue = initial ? initial.kind || "worker" : "worker";
      const leadOptions = members.filter((m) => m.kind === "lead" && m.id !== initial?.id);

      // ---- model directory ----
      // Empty provider + empty model is the "inherit the workspace" state: the
      // member follows the Host default selection, which is what a new session
      // in this workspace would use. The server stores "" for both, so the
      // stored value keeps tracking the Host instead of freezing today's model.
      const providers = catalog?.providers || [];
      const defaultModel = catalog?.defaultModel || null;
      const catalogAvailable = catalog ? catalog.available !== false : false;
      const providerModels = (providers.find((row) => row.id === provider) || {}).models || [];
      // A provider/model that is no longer in the directory must stay visible and
      // selected: silently rewriting a member's model would hide a broken route.
      const providerMissing = provider !== "" && !providers.some((row) => row.id === provider);
      const modelMissing = model !== "" && !providerModels.some((row) => row.id === model);
      const inheritHint = defaultModel
        ? `${t("跟随工作区默认模型")} · ${defaultModel.provider}/${defaultModel.model}`
        : t("跟随工作区默认模型");
      const modelHint = catalogLoading
        ? t("正在读取模型目录")
        : catalogAvailable
          ? provider === "" && model === ""
            ? inheritHint
            : provider !== "" && providerModels.length === 0 && !modelMissing
              ? t("该提供方没有可用模型")
              : ""
          : t("模型目录不可用可手填");

      function changeProvider(next) {
        setProvider(next);
        if (next === "") {
          setModel("");
          return;
        }
        // Keep the model when it still belongs to the chosen provider; otherwise
        // jump to the Host default for that provider, else its first model.
        const models = (providers.find((row) => row.id === next) || {}).models || [];
        if (models.some((row) => row.id === model)) return;
        const preferred = defaultModel && defaultModel.provider === next ? defaultModel.model : "";
        if (preferred && models.some((row) => row.id === preferred)) {
          setModel(preferred);
          return;
        }
        setModel(models[0]?.id || "");
      }

      function changeModel(next) {
        setModel(next);
        // Picking a model without a provider is meaningless: adopt the provider
        // that owns it so the saved pair is always a real route.
        if (next !== "" && provider === "") {
          const owner = providers.find((row) => (row.models || []).some((item) => item.id === next));
          if (owner) setProvider(owner.id);
        }
      }

      function splitSkills() {
        return skills
          .split(/[,，]/)
          .map((skill) => skill.trim())
          .filter(Boolean);
      }

      async function submit() {
        if (!name.trim() || saving) return;
        setSaving(true);
        const body = {
          name: name.trim(),
          role,
          title,
          contact,
          personality,
          skills: splitSkills(),
          provider,
          model,
          status,
        };
        // Creation omits kind on purpose: the server derives it (worker unless
        // the team has no lead). Editing echoes the stored kind back untouched.
        if (initial) body.kind = initial.kind;
        // The lead never reports to anyone; workers may stay orphaned on purpose.
        if (kindValue === "worker" && leadId) body.leadId = leadId;
        try {
          if (initial) {
            await api("/member.update", { method: "POST", body: JSON.stringify({ id: initial.id, ...body }) });
          } else {
            await api("/member.create", { method: "POST", body: JSON.stringify(body) });
          }
          onClose();
          reload();
        } catch (cause) {
          window.alert(`${t("保存失败")}: ${cause?.message || cause}`);
          setSaving(false);
          reload();
        }
      }

      return React.createElement(
        Modal,
        {
          title: initial ? t("编辑") : t("新建成员"),
          onClose,
          footer: [
            React.createElement("button", { key: "cancel", className: "iicp-btn", type: "button", onClick: onClose }, t("取消")),
            React.createElement(
              "button",
              { key: "save", className: "iicp-btn primary", type: "button", disabled: !name.trim() || saving, onClick: submit },
              saving ? `${t("保存中")}…` : t("保存"),
            ),
          ],
        },
        React.createElement(Field, { label: t("名称") },
          React.createElement("input", { value: name, maxLength: 40, onChange: (e) => setName(e.target.value), autoFocus: true })),
        React.createElement(
          "div",
          { className: "iicp-field-row" },
          React.createElement(Field, { label: t("角色") },
            React.createElement(
              "select",
              { value: role, onChange: (e) => setRole(e.target.value) },
              Object.entries(ROLE_LABELS).map(([value, label]) => React.createElement("option", { key: value, value }, t(label))),
            )),
        ),
        kindValue === "worker" && leadOptions.length
          ? React.createElement(Field, { label: t("队长") },
              React.createElement(
                "select",
                { value: leadId, onChange: (e) => setLeadId(e.target.value) },
                [
                  ...leadOptions.map((member) =>
                    React.createElement("option", { key: member.id, value: member.id }, member.name)),
                ],
              ))
          : null,
        React.createElement(
          "div",
          { className: "iicp-field-row" },
          React.createElement(Field, { label: t("职位") },
            React.createElement("input", { value: title, maxLength: 60, onChange: (e) => setTitle(e.target.value) })),
          React.createElement(Field, { label: t("成员状态") },
            React.createElement(
              "select",
              { value: status, onChange: (e) => setStatus(e.target.value) },
              Object.entries(MEMBER_STATUS_LABELS).map(([value, label]) =>
                React.createElement("option", { key: value, value }, t(label))),
            )),
        ),
        React.createElement(Field, { label: `${t("人格")}（${t("可选")}）` },
          React.createElement("textarea", {
            value: personality,
            maxLength: 200,
            rows: 2,
            placeholder: t("这个成员擅长什么、验收要盯什么"),
            onChange: (e) => setPersonality(e.target.value),
          })),
        React.createElement(Field, { label: `${t("技能")}（${t("可选")}）` },
          React.createElement("input", {
            value: skills,
            placeholder: t("技能用逗号分隔，最多 8 个"),
            onChange: (e) => setSkills(e.target.value),
          })),
        React.createElement(
          "div",
          { className: "iicp-field-row" },
          React.createElement(Field, { label: t("提供方") },
            catalogAvailable
              ? React.createElement(
                  "select",
                  { value: provider, onChange: (e) => changeProvider(e.target.value) },
                  [
                    React.createElement("option", { key: "__inherit__", value: "" }, t("继承工作区")),
                    providerMissing
                      ? React.createElement("option", { key: "__missing__", value: provider }, `${provider}（${t("当前值不在目录里")}）`)
                      : null,
                    ...providers.map((row) =>
                      React.createElement("option", { key: row.id, value: row.id }, row.name && row.name !== row.id ? `${row.name}（${row.id}）` : row.id)),
                  ],
                )
              : React.createElement("input", {
                  value: provider,
                  maxLength: 60,
                  placeholder: t("可选"),
                  onChange: (e) => setProvider(e.target.value),
                })),
          React.createElement(Field, { label: t("模型") },
            catalogAvailable
              ? React.createElement(
                  "select",
                  { value: model, onChange: (e) => changeModel(e.target.value) },
                  [
                    React.createElement("option", { key: "__inherit__", value: "" }, t("继承工作区")),
                    modelMissing
                      ? React.createElement("option", { key: "__missing__", value: model }, `${model}（${t("当前值不在目录里")}）`)
                      : null,
                    ...providerModels.map((row) =>
                      React.createElement("option", { key: row.id, value: row.id }, row.name && row.name !== row.id ? `${row.name}（${row.id}）` : row.id)),
                  ],
                )
              : React.createElement("input", {
                  value: model,
                  maxLength: 60,
                  placeholder: t("可选"),
                  onChange: (e) => setModel(e.target.value),
                })),
        ),
        modelHint ? React.createElement("p", { className: "iicp-team-hint" }, modelHint) : null,
        React.createElement(Field, { label: `${t("联系方式")}（${t("可选")}）` },
          React.createElement("input", { value: contact, maxLength: 80, onChange: (e) => setContact(e.target.value) })),
      );
    }

    function ProjectModal({ initial, state, onClose, reload }) {
      const [name, setName] = React.useState(initial?.name || "");
      const [notes, setNotes] = React.useState(initial?.notes || "");
      const [dueDate, setDueDate] = React.useState(initial?.dueDate || "");
      const [workspaceId, setWorkspaceId] = React.useState(initial?.workspaceId || "");
      const [archived, setArchived] = React.useState(Boolean(initial?.archived));
      const [saving, setSaving] = React.useState(false);
      const workspaces = (state?.workspaces || []).filter((workspace) => workspace.included !== false);
      // A stale binding (e.g. written by the old workspace parser) is not in the
      // option list; surface it instead of silently showing "不关联工作区".
      const staleBinding = Boolean(workspaceId) && !workspaces.some((workspace) => workspace.id === workspaceId);

      async function submit() {
        if (!name.trim() || saving) return;
        setSaving(true);
        const body = { name: name.trim(), notes, dueDate, workspaceId, archived };
        try {
          if (initial) {
            await api("/project.update", {
              method: "POST",
              body: JSON.stringify({ id: initial.id, ...body, expectedUpdatedAt: initial.updatedAt }),
            });
          } else {
            await api("/project.create", { method: "POST", body: JSON.stringify(body) });
          }
          onClose();
          reload();
        } catch (cause) {
          // Conflicts mean someone else wrote first: refresh so the user can redo.
          window.alert(`${t("保存失败")}: ${cause?.message || cause}`);
          setSaving(false);
          reload();
        }
      }

      return React.createElement(
        Modal,
        {
          title: initial ? t("编辑项目") : t("新建项目"),
          onClose,
          footer: [
            React.createElement("button", { key: "cancel", className: "iicp-btn", type: "button", onClick: onClose }, t("取消")),
            React.createElement(
              "button",
              {
                key: "save",
                className: "iicp-btn primary",
                type: "button",
                disabled: !name.trim() || saving,
                onClick: submit,
              },
              saving ? `${t("保存中")}…` : t("保存"),
            ),
          ],
        },
        React.createElement(Field, { label: t("名称") },
          React.createElement("input", {
            value: name,
            maxLength: 80,
            placeholder: t("要给这个项目起个名字"),
            onChange: (e) => setName(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") submit();
            },
            autoFocus: true,
          })),
        React.createElement(Field, { label: `${t("备注")}（${t("可选")}）` },
          React.createElement("textarea", {
            value: notes,
            maxLength: 600,
            rows: 3,
            placeholder: t("这个项目要解决什么问题、验收标准是什么"),
            onChange: (e) => setNotes(e.target.value),
          })),
        React.createElement(
          "div",
          { className: "iicp-field-row" },
          React.createElement(Field, { label: `${t("到期日")}（${t("可选")}）` },
            React.createElement("input", {
              type: "date",
              value: dueDate,
              max: "9999-12-31",
              onChange: (e) => setDueDate(e.target.value),
            })),
          React.createElement(Field, { label: `${t("关联工作区")}（${t("可选")}）` },
            React.createElement(
              "select",
              { value: workspaceId, onChange: (e) => setWorkspaceId(e.target.value) },
              [
                React.createElement("option", { key: "__none__", value: "" }, t("不关联工作区")),
                ...(staleBinding
                  ? [React.createElement("option", { key: "__stale__", value: workspaceId }, `${workspaceId}（${t("已失效")}）`)]
                  : []),
                ...workspaces.map((workspace) =>
                  React.createElement(
                    "option",
                    { key: workspace.id, value: workspace.id },
                    workspace.title || workspace.path || workspace.id,
                  ),
                ),
              ],
            )),
        ),
        staleBinding
          ? React.createElement("p", { className: "iicp-note-tiny" }, t("该工作区已不在 DSH 中，保存后会解除绑定"))
          : null,
        initial
          ? React.createElement(Field, { label: t("归档") },
              React.createElement(
                "label",
                { className: "iicp-check" },
                React.createElement("input", {
                  type: "checkbox",
                  checked: archived,
                  onChange: (e) => setArchived(e.target.checked),
                }),
                t("归档后默认不在列表显示"),
              ))
          : null,
      );
    }

    /* ---------------- Root page ---------------- */
    function StatLine({ state }) {
      if (!state) return React.createElement("p", { className: "iicp-stats-line" }, `${t("正在加载")}…`);
      const { byStatus, total } = state.stats;
      const parts = [];
      for (const status of STATUS_KEYS) {
        if (!byStatus[status]) continue;
        parts.push(
          React.createElement(
            "span",
            { key: status, className: "iicp-stats-group" },
            React.createElement("span", { className: `iicp-dot is-${status}` }),
            `${byStatus[status]} ${t(STATUS_LABELS[status])}`,
          ),
        );
      }
      return React.createElement(
        "p",
        { className: "iicp-stats-line", title: `${t("全部任务")} ${total}` },
        React.createElement("span", { className: "iicp-stats-total" }, `${total} ${t("项")}`),
        parts,
      );
    }

    function Toasts({ items }) {
      if (!items.length) return null;
      return React.createElement(
        "div",
        { className: "iicp-toasts", role: "status", "aria-live": "polite" },
        items.map((item) => React.createElement("div", { key: item.id, className: "iicp-toast" }, item.text)),
      );
    }


    /* ---------------- lead agent drawer ---------------- */
    /**
     * 队长会话：与队长 agent 的对话框。SSE 推增量，断线后退回 1 秒轮询
     * transcript（design D11）。计划闸门由服务端提示词约束，这里提供
     * 「确认执行」快捷句，避免用户手动输入确认语。
     */
    /** 成员会话记录（只读）：取该成员最近一次映射的 sessionId。 */
    function TranscriptModal({ member, onClose }) {
      const sessionIds = Object.values(member.sessions || {}).filter(Boolean);
      const sessionId = sessionIds.length ? sessionIds[sessionIds.length - 1] : "";
      const [entries, setEntries] = React.useState(null);
      const [error, setError] = React.useState("");
      React.useEffect(() => {
        if (!sessionId) {
          setEntries([]);
          return undefined;
        }
        let alive = true;
        api(`/agent/transcript?sessionId=${encodeURIComponent(sessionId)}`)
          .then((payload) => {
            if (alive) setEntries(Array.isArray(payload.transcript) ? payload.transcript : []);
          })
          .catch((cause) => {
            if (alive) {
              setError(String(cause?.message || cause));
              setEntries([]);
            }
          });
        return () => {
          alive = false;
        };
      }, [sessionId]);

      return React.createElement(
        Modal,
        {
          title: `${t("会话记录")} · ${member.name}`,
          className: "iicp-roster-modal",
          onClose,
          footer: React.createElement("button", { className: "iicp-btn", type: "button", onClick: onClose }, t("关闭")),
        },
        React.createElement(
          "div",
          { className: "iicp-agent-body", style: { maxHeight: "58vh" } },
          entries === null
            ? React.createElement("p", { className: "iicp-agent-empty" }, t("加载中"))
            : entries.length === 0
              ? React.createElement("p", { className: "iicp-agent-empty" }, error || t("暂无会话记录"))
              : entries.map((entry, index) =>
                  React.createElement("div", { key: index, className: `iicp-agent-msg is-${entry.role}` }, entry.text),
                ),
        ),
      );
    }

    function AgentDrawer({ onClose, pushToast }) {
      const [sessionId, setSessionId] = React.useState("");
      const [available, setAvailable] = React.useState(null);
      const [messages, setMessages] = React.useState([]);
      const [draft, setDraft] = React.useState("");
      const [sending, setSending] = React.useState(false);
      const [streaming, setStreaming] = React.useState(false);
      const [online, setOnline] = React.useState("connecting");
      const [error, setError] = React.useState("");
      const listRef = React.useRef(null);
      const sessionRef = React.useRef("");

      React.useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, [messages, streaming]);

      const applyTranscript = React.useCallback((entries) => {
        setMessages(
          (Array.isArray(entries) ? entries : []).map((entry) => ({
            role: entry.role === "user" ? "user" : "assistant",
            text: String(entry.text || ""),
          })),
        );
      }, []);

      React.useEffect(() => {
        let alive = true;
        api("/agent/lead", { method: "POST", body: "{}" })
          .then((payload) => {
            if (!alive) return;
            setAvailable(payload.available !== false);
            if (payload.available === false) {
              setOnline("offline");
              return;
            }
            setSessionId(payload.sessionId);
            sessionRef.current = payload.sessionId;
            if (Array.isArray(payload.transcript)) applyTranscript(payload.transcript);
            setOnline("online");
          })
          .catch((cause) => {
            if (!alive) return;
            setAvailable(false);
            setOnline("offline");
            setError(String(cause?.message || cause));
          });
        return () => {
          alive = false;
        };
      }, [applyTranscript]);

      React.useEffect(() => {
        if (!sessionId) return undefined;
        let source = null;
        let poll = null;
        let disposed = false;
        const startPoll = () => {
          if (poll !== null) return;
          setOnline("offline");
          poll = setInterval(() => {
            api(`/agent/transcript?sessionId=${encodeURIComponent(sessionRef.current)}`)
              .then((payload) => {
                if (!disposed && Array.isArray(payload.transcript)) applyTranscript(payload.transcript);
              })
              .catch(() => {});
          }, 1000);
        };
        try {
          source = new EventSource(`${API_PREFIX}/agent/stream?sessionId=${encodeURIComponent(sessionId)}`);
          source.onmessage = (event) => {
            let frame;
            try {
              frame = JSON.parse(event.data);
            } catch {
              return;
            }
            if (!frame || typeof frame !== "object") return;
            if (frame.type === "ready") {
              setOnline("online");
              return;
            }
            if (frame.type === "user") {
              setMessages((current) => {
                const last = current[current.length - 1];
                if (last && last.role === "user" && last.text === frame.text) return current;
                return [...current, { role: "user", text: String(frame.text || "") }];
              });
              return;
            }
            if (frame.type === "assistant-start") {
              setStreaming(true);
              setMessages((current) => [...current, { role: "assistant", text: "", pending: true }]);
              return;
            }
            if (frame.type === "chunk") {
              setMessages((current) => {
                const next = current.slice();
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = { ...last, text: last.text + String(frame.text || ""), pending: true };
                } else {
                  next.push({ role: "assistant", text: String(frame.text || ""), pending: true });
                }
                return next;
              });
              return;
            }
            if (frame.type === "assistant-end") {
              setStreaming(false);
              setMessages((current) => {
                const next = current.slice();
                const last = next[next.length - 1];
                if (last && last.role === "assistant") next[next.length - 1] = { ...last, pending: false };
                return next;
              });
            }
          };
          source.onerror = () => {
            try {
              source?.close();
            } catch {
              /* already closed */
            }
            source = null;
            startPoll();
          };
        } catch {
          startPoll();
        }
        return () => {
          disposed = true;
          try {
            source?.close();
          } catch {
            /* already closed */
          }
          if (poll !== null) clearInterval(poll);
        };
      }, [sessionId, applyTranscript]);

      const send = (text) => {
        const value = String(text ?? "").trim();
        if (!value || sending || !sessionId) return;
        setSending(true);
        setDraft("");
        api("/agent/message", { method: "POST", body: JSON.stringify({ sessionId, text: value }) })
          .then(() => {
            setError("");
            setMessages((current) => {
              const last = current[current.length - 1];
              if (last && last.role === "user" && last.text === value) return current;
              return [...current, { role: "user", text: value }];
            });
          })
          .catch((cause) => {
            const message = String(cause?.message || cause);
            setError(message);
            pushToast?.(message);
          })
          .finally(() => setSending(false));
      };

      const hasAssistant = messages.some((message) => message.role === "assistant" && message.text);
      const statusClass = online === "online" ? "is-online" : online === "offline" ? "is-offline" : "";
      const statusLabel = online === "online" ? t("已连接") : online === "offline" ? t("重新连接") : t("连接中");

      return React.createElement(
        "aside",
        { className: "iicp-drawer iicp-agent-drawer", role: "dialog", "aria-label": t("队长会话") },
        React.createElement(
          "header",
          { className: "iicp-drawer-head" },
          React.createElement(
            "div",
            { className: "iicp-drawer-head-text" },
            React.createElement("span", { className: "iicp-drawer-kicker" }, "IICP AGENT"),
            React.createElement("h2", { className: "iicp-drawer-title" }, t("与队长对话")),
            React.createElement(
              "span",
              { className: `iicp-agent-status ${statusClass}` },
              React.createElement("i", { "aria-hidden": "true" }),
              statusLabel,
            ),
          ),
          React.createElement(
            "button",
            { className: "iicp-icon-btn", type: "button", onClick: onClose, "aria-label": t("关闭") },
            React.createElement(Icon, { name: "close", size: 12 }),
          ),
        ),
        React.createElement(
          "div",
          { className: "iicp-agent-body", ref: listRef },
          available === false
            ? React.createElement("p", { className: "iicp-agent-empty" }, t("AI会话不可用"))
            : messages.length === 0
              ? React.createElement(
                  "p",
                  { className: "iicp-agent-empty" },
                  t("告诉队长要做什么：它会先给计划，确认后再建卡派单。"),
                )
              : messages.map((message, index) =>
                  React.createElement(
                    "div",
                    {
                      key: index,
                      className: `iicp-agent-msg is-${message.role}${message.pending ? " is-pending" : ""}`,
                    },
                    message.text || (message.pending ? "…" : ""),
                  ),
                ),
        ),
        React.createElement(
          "div",
          { className: "iicp-agent-foot" },
          error ? React.createElement("p", { className: "iicp-agent-empty" }, error) : null,
          React.createElement("textarea", {
            className: "iicp-agent-input",
            value: draft,
            placeholder: t("给队长发消息…"),
            "aria-label": t("给队长发消息…"),
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(draft);
              }
            },
          }),
          React.createElement(
            "div",
            { className: "iicp-agent-actions" },
            React.createElement(
              "span",
              { className: "iicp-agent-hint" },
              streaming ? t("队长正在思考") : sending ? t("发送") : "",
            ),
            hasAssistant
              ? React.createElement(
                  "button",
                  {
                    className: "iicp-btn",
                    type: "button",
                    disabled: streaming || sending,
                    onClick: () => send(t("确认执行以上计划")),
                  },
                  t("确认执行"),
                )
              : null,
            React.createElement(
              "button",
              {
                className: "iicp-btn primary",
                type: "button",
                disabled: !sessionId || sending || !draft.trim(),
                onClick: () => send(draft),
              },
              t("发送"),
            ),
          ),
        ),
      );
    }

    function PageTeamBoard(props) {
      const { state, error, reload } = useBoardState();
      const [view, setView] = React.useState("board");
      const [taskModal, setTaskModal] = React.useState(null);
      const [drawerTaskId, setDrawerTaskId] = React.useState(null);
      const [memberModal, setMemberModal] = React.useState(null);
      const [projectModal, setProjectModal] = React.useState(null);
      const [query, setQuery] = React.useState("");
      const [toasts, setToasts] = React.useState([]);
      const [scope, setScope] = React.useState(null);
      const [agentOpen, setAgentOpen] = React.useState(false);
      const searchRef = React.useRef(null);
      const toastSeq = React.useRef(0);

      const pushToast = React.useCallback((text) => {
        if (!text) return;
        toastSeq.current += 1;
        const id = toastSeq.current;
        setToasts((current) => [...current, { id, text }]);
        setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 2600);
      }, []);

      const openTaskModal = (task, preset = {}) =>
        setTaskModal(task ? { initial: task, preset } : { initial: null, preset });
      const openTaskDrawer = (task) => setDrawerTaskId(task?.id || null);
      const openMemberModal = (member) => setMemberModal(member === null ? { initial: null } : { initial: member });
      const openProjectModal = (project) => setProjectModal(project === null ? { initial: null } : { initial: project });

      // 项目卡片上的「看板」：跳到看板视图并把范围收窄到该项目 / 工作区。
      const openScope = (projectId, isWorkspace) => {
        setScope({
          projectId: isWorkspace ? "" : projectId,
          workspaceId: isWorkspace ? (projectId === "__ws__" ? "" : projectId) : "",
          nonce: Date.now(),
        });
        setView("board");
      };

      // 抽屉跟随轮询后的最新任务（详情始终是当前快照）；任务被删除时抽屉自动关闭。
      const drawerTask = drawerTaskId ? (state?.tasks || []).find((task) => task.id === drawerTaskId) || null : null;
      React.useEffect(() => {
        if (drawerTaskId && state && !drawerTask) setDrawerTaskId(null);
      }, [drawerTaskId, state, drawerTask]);

      // 键盘：/ 聚焦搜索、n 新建任务、Esc 逐层关闭（输入框聚焦时只处理 Esc）。
      React.useEffect(() => {
        function onKeyDown(event) {
          const tag = String(event.target?.tagName || "").toLowerCase();
          const typing = tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable;
          if (event.key === "Escape") {
            if (taskModal) {
              setTaskModal(null);
              return;
            }
            if (drawerTaskId) {
              setDrawerTaskId(null);
              return;
            }
            if (agentOpen) {
              setAgentOpen(false);
              return;
            }
            if (query) setQuery("");
            return;
          }
          if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
          if (event.key === "/") {
            event.preventDefault();
            searchRef.current?.focus();
            return;
          }
          if (event.key === "n" || event.key === "N") {
            event.preventDefault();
            openTaskModal(null);
          }
        }
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
      }, [taskModal, drawerTaskId, agentOpen, query]);

      const busy = !state && !error;

      const header = React.createElement(
        "header",
        { className: "iicp-header" },
        React.createElement(
          "div",
          { className: "iicp-header-main" },
          React.createElement("h1", { className: "iicp-title" }, t("一体化智能协作平台")),
          React.createElement(StatLine, { state }),
        ),
        React.createElement(
          "div",
          { className: "iicp-header-actions" },
          React.createElement(
            "button",
            {
              className: "iicp-btn",
              type: "button",
              onClick: () => setAgentOpen(true),
              title: t("与队长对话"),
            },
            React.createElement(Icon, { name: "chat", size: 12 }),
            t("队长"),
          ),
          view === "board"
            ? React.createElement(
                "label",
                { className: "iicp-search", title: t("按 / 搜索，按 n 新建") },
                React.createElement(Icon, { name: "search", size: 12 }),
                React.createElement("input", {
                  ref: searchRef,
                  type: "search",
                  value: query,
                  placeholder: t("搜索任务"),
                  "aria-label": t("搜索任务"),
                  onChange: (event) => setQuery(event.target.value),
                }),
              )
            : null,
          view === "board"
            ? React.createElement(
                "button",
                { className: "iicp-btn primary", type: "button", onClick: () => openTaskModal(null) },
                t("新建任务"),
              )
            : null,
          view === "projects"
            ? React.createElement(
                "button",
                { className: "iicp-btn primary", type: "button", onClick: () => openProjectModal(null) },
                t("新建项目"),
              )
            : null,
        ),
      );

      const slimSwitch = React.createElement(
        "div",
        { className: "iicp-view-switch", role: "group", "aria-label": t("视图") },
        [["board", t("看板")], ["projects", t("项目")], ["members", t("团队")]].map(([key, label]) =>
          React.createElement(
            "button",
            {
              key,
              type: "button",
              "aria-pressed": view === key,
              onClick: () => setView(key),
            },
            label,
          ),
        ),
      );

      return React.createElement(
        "div",
        { className: "iicp-board", "data-plugin": PANEL_ID, "data-view": view },
        header,
        error
          ? React.createElement(
              "div",
              { className: "iicp-empty-state" },
              React.createElement("p", { className: "iicp-error-title" }, t("看板加载失败")),
              React.createElement("p", { className: "iicp-error-detail" }, String(error)),
              React.createElement("button", { className: "iicp-btn", type: "button", onClick: reload }, t("重试")),
              React.createElement("p", { className: "iicp-note-tiny" }, t("后台会自动重连，也可以稍等几秒。")),
            )
          : null,
        !error && busy
          ? React.createElement(
              "div",
              { className: "iicp-loading", "aria-busy": "true", "aria-label": t("正在加载") },
              React.createElement("div", { className: "iicp-loading-line" }),
              React.createElement("div", { className: "iicp-loading-line" }),
              React.createElement("div", { className: "iicp-loading-line" }),
            )
          : null,
        !error && state
          ? view === "board"
            ? React.createElement(BoardView, {
                state,
                reload,
                openTaskModal,
                openTaskDrawer,
                query,
                pushToast,
                leading: slimSwitch,
                scope,
                onScopeApplied: () => setScope(null),
              })
            : view === "projects"
              ? React.createElement(ProjectsView, {
                  state,
                  reload,
                  openProjectModal,
                  onBoard: openScope,
                  pushToast,
                  leading: slimSwitch,
                })
              : React.createElement(MembersView, { state, reload, openMemberModal, leading: slimSwitch, pushToast })
          : null,
        drawerTask
          ? React.createElement(TaskDrawer, {
              key: drawerTask.id,
              task: drawerTask,
              members: (state?.members || []).filter((m) => !m.archived),
              projects: (state?.projects || []).filter((p) => !p.archived),
              tasks: state?.tasks || [],
              onClose: () => setDrawerTaskId(null),
              onEdit: (task) => {
                setDrawerTaskId(null);
                openTaskModal(task);
              },
            })
          : null,
        agentOpen
          ? React.createElement(AgentDrawer, { onClose: () => setAgentOpen(false), pushToast })
          : null,
        taskModal
          ? React.createElement(TaskModal, {
              key: taskModal.initial?.id || "new",
              initial: taskModal.initial,
              preset: taskModal.preset || {},
              state,
              onClose: () => setTaskModal(null),
              reload,
            })
          : null,
        memberModal
          ? React.createElement(MemberModal, {
              key: memberModal.initial?.id || "new",
              initial: memberModal.initial,
              state,
              onClose: () => setMemberModal(null),
              reload,
            })
          : null,
        projectModal
          ? React.createElement(ProjectModal, {
              key: projectModal.initial?.id || "new",
              initial: projectModal.initial,
              state,
              onClose: () => setProjectModal(null),
              reload,
            })
          : null,
        React.createElement(Toasts, { items: toasts }),
      );
    }

    /* ---------------- apply ---------------- */
    function SidebarKanbanIcon({ size }) {
      return React.createElement(
        "span",
        {
          style: {
            width: (size || 18) + "px",
            height: (size || 18) + "px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
          },
        },
        ["#3b82f6", "#f59e0b", "#10b981"].map((color, i) =>
          React.createElement("span", {
            key: i,
            style: {
              width: "4px",
              height: "12px",
              borderRadius: "2px",
              background: color,
              display: "inline-block",
            },
          }),
        ),
      );
    }

    function apply(ctx) {
      try {
        localeService = ctx.get("locale");
      } catch {
        localeService = null;
      }
      ctx.effect(() => {
        const tag = ensureStyle();
        return () => tag.remove();
      }, "iicp-kanban: styles");

      ctx.slots.inject("main", function* () {
        yield ctx.slots.register({ name: "main", key: PANEL_ID, locale: "iicpKanban" }, PageTeamBoard);
      });
      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 3,
            label: () => t("一体化智能协作平台"),
            locale: "iicpKanban",
          },
          SidebarKanbanIcon,
        ),
      );
    }

    return {
      apply,
      inject: ["slots", "locale"],
    };
  },
});
