import React, { useEffect, useRef } from 'react';
import { Note } from '../../types';
import * as d3 from 'd3';

interface GalaxyViewProps {
  notes: Note[];
  projectName: string;
  onSelectNote: (id: string) => void;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  group: number;
  radius: number;
  title: string;
  type: 'project' | 'domain' | 'note';
  status?: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  value: number;
}

export const GalaxyView: React.FC<GalaxyViewProps> = ({ notes, projectName, onSelectNote }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || notes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Clear previous graph
    d3.select(svgRef.current).selectAll("*").remove();

    // Prepare data
    const nodes: Node[] = [];
    const links: Link[] = [];

    // Central Project Node
    nodes.push({
      id: 'project',
      group: 0,
      radius: 40,
      title: projectName,
      type: 'project'
    });

    // Extract unique domains
    const domains = Array.from(new Set(notes.map(n => n.folder || 'General')));
    
    domains.forEach((domain, i) => {
      const domainId = `domain-${domain}`;
      nodes.push({
        id: domainId,
        group: i + 1,
        radius: 25,
        title: domain,
        type: 'domain'
      });
      links.push({
        source: 'project',
        target: domainId,
        value: 2
      });
    });

    // Add notes
    notes.forEach(note => {
      const domainId = `domain-${note.folder || 'General'}`;
      nodes.push({
        id: note.id,
        group: domains.indexOf(note.folder || 'General') + 1,
        radius: 15,
        title: note.title || 'Untitled',
        type: 'note',
        status: note.status
      });
      links.push({
        source: domainId,
        target: note.id,
        value: 1
      });
    });

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .style("max-width", "100%")
      .style("height", "auto");

    // Add zoom capabilities
    const g = svg.append("g");
    
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
      
    svg.call(zoom);

    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(d => d.source === 'project' ? 150 : 80))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<Node>().radius(d => d.radius + 10).iterations(2));

    const link = g.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.3)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => Math.sqrt(d.value));

    const node = g.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", d => d.radius)
      .attr("fill", d => {
        if (d.type === 'project') return '#8b5cf6'; // purple-500
        if (d.type === 'domain') return '#3b82f6'; // blue-500
        if (d.status === 'Done') return '#10b981'; // emerald-500
        if (d.status === 'Conflict') return '#f43f5e'; // rose-500
        if (d.status === 'In Progress') return '#f59e0b'; // amber-500
        return '#64748b'; // slate-500
      })
      .style("cursor", d => d.type === 'note' ? 'pointer' : 'default')
      .on("click", (event, d) => {
        if (d.type === 'note') {
          onSelectNote(d.id);
        }
      });

    node.append("title")
      .text(d => d.title);

    const labels = g.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text(d => d.title.length > 15 ? d.title.substring(0, 15) + '...' : d.title)
      .attr("font-size", d => d.type === 'project' ? "14px" : d.type === 'domain' ? "12px" : "10px")
      .attr("font-weight", d => d.type === 'note' ? "normal" : "bold")
      .attr("fill", "currentColor")
      .attr("text-anchor", "middle")
      .attr("dy", d => d.radius + 15)
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as Node).x!)
        .attr("y1", d => (d.source as Node).y!)
        .attr("x2", d => (d.target as Node).x!)
        .attr("y2", d => (d.target as Node).y!);

      node
        .attr("cx", d => d.x!)
        .attr("cy", d => d.y!);
        
      labels
        .attr("x", d => d.x!)
        .attr("y", d => d.y!);
    });

    // Drag functions
    const drag = d3.drag<SVGCircleElement, Node>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag as any);

    return () => {
      simulation.stop();
    };
  }, [notes, projectName, onSelectNote]);

  return (
    <div ref={containerRef} className="w-full h-full bg-card border border-border rounded-3xl shadow-sm overflow-hidden relative">
      <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm p-3 rounded-xl border border-border text-xs space-y-2 z-10">
        <div className="font-bold mb-2 uppercase tracking-widest text-muted-foreground">Legend</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div> Project Core</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Domain</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-500"></div> Planned</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div> In Progress</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Done</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-500"></div> Conflict</div>
      </div>
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing"></svg>
    </div>
  );
};
