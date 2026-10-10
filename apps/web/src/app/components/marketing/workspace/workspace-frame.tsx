import Image from "next/image";
import { Bell, ChevronDown, CircleHelp, PanelLeft, Plus, Search, Settings, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { NAV, SCENE_VIEW } from "./nav";

export function WorkspaceFrame({
	scene,
	collapsed = false,
	children,
}: {
	scene: number;
	collapsed?: boolean;
	children: ReactNode;
}) {
	const view = SCENE_VIEW[scene];
	return (
		<div className="lp-workspace" data-collapsed={collapsed || undefined}>
			<aside className="lp-workspace-sidebar">
				<div className="lp-workspace-brand">
					{collapsed ? (
						<Image src="/OneTool-mark.png" alt="" width={24} height={24} />
					) : (
						<Image src="/OneTool.png" alt="" width={112} height={40} />
					)}
				</div>
				<div className="lp-workspace-org"><span>RH</span>Ridgeline Home Services<ChevronDown size={12} /></div>
				<div className="lp-workspace-nav-sections">
					<p className="lp-workspace-group">Quick actions</p>
					<div className="lp-workspace-nav"><div><Plus size={16} aria-hidden="true" /><span>Create</span></div></div>
					{NAV.map((group) => (
						<div className="lp-workspace-nav-section" key={group.label}>
							<p className="lp-workspace-group">{group.label}</p>
							<div className="lp-workspace-nav">
								{group.items.map(({ title, icon: Icon }) => (
									<div key={title} data-active={view?.nav === title || undefined}>
										<Icon size={16} strokeWidth={1.75} aria-hidden="true" />
										<span>{title}</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
				<div className="lp-workspace-user"><span>DR</span><div>Dana Ruiz<small>Business owner</small></div><ChevronDown size={12} /></div>
			</aside>
			<div className="lp-workspace-main">
				<div className="lp-workspace-toolbar"><PanelLeft size={15} /><span className="lp-workspace-search"><Search size={13} />Search your workspace<span>⌘K</span></span><span className="lp-workspace-toolbar-actions"><CircleHelp size={15} /><Bell size={15} /><Settings size={15} /></span></div>
				<div className="lp-workspace-canvas">
					<div className="lp-workspace-content">{children}</div>
					<div className="lp-workspace-assistant"><Sparkles size={14} /><span>Assistant</span><span>Ask about your business</span></div>
				</div>
			</div>
		</div>
	);
}
