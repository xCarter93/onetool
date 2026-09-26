import Image from "next/image";
import { Bell, ChevronDown, CircleHelp, Search, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { CRUMB, NAV, SCENE_NAV } from "../chapters";

export function WorkspaceFrame({ scene, children }: { scene: number; children: ReactNode }) {
	return (
		<div className="lp-workspace">
			<aside className="lp-workspace-sidebar">
				<div className="lp-workspace-brand"><Image src="/OneTool.png" alt="" width={112} height={40} loading="eager" /></div>
				<div className="lp-workspace-org"><span>WL</span>Whitfield Services<ChevronDown size={12} /></div>
				<p className="lp-workspace-group">Workspace</p>
				<div className="lp-workspace-nav">
					{NAV.map((item, index) => (
						<div key={item.label} data-active={SCENE_NAV[scene] === index || undefined}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.d} /></svg>
							{item.label}
						</div>
					))}
				</div>
				<div className="lp-workspace-user"><span>DW</span><div>Dana Whitfield<small>Business owner</small></div><ChevronDown size={12} /></div>
			</aside>
			<div className="lp-workspace-main">
				<div className="lp-workspace-toolbar"><span className="lp-workspace-breadcrumb">{CRUMB[scene]}</span><span className="lp-workspace-search"><Search size={13} />Search your workspace<span>⌘K</span></span><CircleHelp size={15} /><Bell size={15} /></div>
				<div className="lp-workspace-canvas">
					<div className="lp-workspace-content">{children}</div>
					<div className="lp-workspace-assistant"><Sparkles size={14} /><span>Assistant</span><span>Ask about your business</span></div>
				</div>
			</div>
		</div>
	);
}
