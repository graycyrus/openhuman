import { describe, expect, it } from 'vitest';

import {
  autoLayout,
  edgeId,
  type FlowEdge,
  type FlowNode,
  workflowGraphToXyflow,
  xyflowToWorkflowGraph,
} from './graphAdapter';
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from './types';

function node(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id: 'n1', kind: 'agent', name: 'Agent', config: {}, ports: [], ...overrides };
}

function edge(overrides: Partial<WorkflowEdge> = {}): WorkflowEdge {
  return { from_node: 'a', from_port: 'main', to_node: 'b', to_port: 'main', ...overrides };
}

function graph(overrides: Partial<WorkflowGraph> = {}): WorkflowGraph {
  return { schema_version: 1, id: 'wf_1', name: 'demo', nodes: [], edges: [], ...overrides };
}

describe('graphAdapter', () => {
  describe('workflowGraphToXyflow', () => {
    it('returns empty nodes/edges for an empty graph', () => {
      const { nodes, edges } = workflowGraphToXyflow(graph());
      expect(nodes).toEqual([]);
      expect(edges).toEqual([]);
    });

    it('maps a node to a flowNode with kind/name/config/ports in data', () => {
      const g = graph({
        nodes: [
          node({
            id: 't',
            kind: 'trigger',
            name: 'Start',
            config: { mode: 'manual' },
            ports: [{ name: 'main' }],
            position: { x: 10, y: 20 },
          }),
        ],
      });
      const { nodes } = workflowGraphToXyflow(g);
      expect(nodes).toHaveLength(1);
      const [flowNode] = nodes;
      expect(flowNode.id).toBe('t');
      expect(flowNode.type).toBe('flowNode');
      expect(flowNode.position).toEqual({ x: 10, y: 20 });
      expect(flowNode.data.kind).toBe('trigger');
      expect(flowNode.data.name).toBe('Start');
      expect(flowNode.data.config).toEqual({ mode: 'manual' });
      expect(flowNode.data.ports).toEqual([{ name: 'main' }]);
    });

    it('maps edge handles: id, source/target, sourceHandle/targetHandle', () => {
      const g = graph({
        nodes: [node({ id: 'a' }), node({ id: 'b' })],
        edges: [edge({ from_node: 'a', from_port: 'true', to_node: 'b', to_port: 'in' })],
      });
      const { edges } = workflowGraphToXyflow(g);
      expect(edges).toEqual([
        { id: 'a-true-b-in', source: 'a', target: 'b', sourceHandle: 'true', targetHandle: 'in' },
      ]);
    });

    it('uses the saved position when present, without invoking auto-layout', () => {
      const g = graph({ nodes: [node({ id: 'a', position: { x: 500, y: 600 } })] });
      const { nodes } = workflowGraphToXyflow(g);
      expect(nodes[0].position).toEqual({ x: 500, y: 600 });
    });

    it('auto-lays-out nodes missing a position', () => {
      const g = graph({
        nodes: [node({ id: 't', kind: 'trigger' }), node({ id: 'a', kind: 'agent' })],
        edges: [edge({ from_node: 't', to_node: 'a' })],
      });
      const { nodes } = workflowGraphToXyflow(g);
      const byId = Object.fromEntries(nodes.map(n => [n.id, n.position]));
      expect(byId.t).toEqual({ x: 0, y: 0 });
      expect(byId.a).toEqual({ x: 0, y: 160 });
    });

    it('derives effective input/output ports for a switch node from its edges, not just declared ports', () => {
      const g = graph({
        nodes: [
          node({ id: 't', kind: 'trigger' }),
          node({ id: 'sw', kind: 'switch', ports: [] }),
          node({ id: 'a', kind: 'agent' }),
          node({ id: 'b', kind: 'agent' }),
        ],
        edges: [
          edge({ from_node: 't', from_port: 'main', to_node: 'sw', to_port: 'main' }),
          edge({ from_node: 'sw', from_port: 'case_a', to_node: 'a', to_port: 'main' }),
          edge({ from_node: 'sw', from_port: 'case_b', to_node: 'b', to_port: 'main' }),
        ],
      });
      const { nodes } = workflowGraphToXyflow(g);
      const sw = nodes.find(n => n.id === 'sw')!;
      expect(sw.data.inputPorts).toEqual(['main']);
      expect(sw.data.outputPorts).toEqual(['case_a', 'case_b']);
    });

    it('defaults to a single "main" input/output port for an unwired node', () => {
      const g = graph({ nodes: [node({ id: 'solo', ports: [] })] });
      const { nodes } = workflowGraphToXyflow(g);
      expect(nodes[0].data.inputPorts).toEqual(['main']);
      expect(nodes[0].data.outputPorts).toEqual(['main']);
    });
  });

  describe('xyflowToWorkflowGraph', () => {
    it('round-trips a graph through workflowGraphToXyflow and back', () => {
      const original = graph({
        nodes: [
          node({
            id: 't',
            kind: 'trigger',
            name: 'Start',
            config: { mode: 'manual' },
            ports: [],
            position: { x: 0, y: 0 },
          }),
          node({
            id: 'a',
            kind: 'agent',
            name: 'Reply',
            config: { prompt: 'hi' },
            ports: [{ name: 'main' }],
            position: { x: 280, y: 0 },
          }),
        ],
        edges: [edge({ from_node: 't', from_port: 'main', to_node: 'a', to_port: 'main' })],
      });

      const { nodes, edges } = workflowGraphToXyflow(original);
      const roundTripped = xyflowToWorkflowGraph(nodes, edges, {
        schema_version: original.schema_version,
        id: original.id,
        name: original.name,
      });

      expect(roundTripped).toEqual(original);
    });

    it('reassembles graph-level metadata (schema_version/id/name) from the passed meta, not the nodes', () => {
      const result = xyflowToWorkflowGraph([], [], {
        schema_version: 1,
        id: 'wf_2',
        name: 'renamed',
      });
      expect(result).toEqual({
        schema_version: 1,
        id: 'wf_2',
        name: 'renamed',
        nodes: [],
        edges: [],
      });
    });

    it('defaults a missing sourceHandle/targetHandle to "main"', () => {
      const flowNodes: FlowNode[] = [
        {
          id: 'a',
          type: 'flowNode',
          position: { x: 0, y: 0 },
          data: {
            kind: 'agent',
            name: 'A',
            config: {},
            ports: [],
            inputPorts: ['main'],
            outputPorts: ['main'],
          },
        },
        {
          id: 'b',
          type: 'flowNode',
          position: { x: 0, y: 160 },
          data: {
            kind: 'agent',
            name: 'B',
            config: {},
            ports: [],
            inputPorts: ['main'],
            outputPorts: ['main'],
          },
        },
      ];
      const flowEdges: FlowEdge[] = [{ id: 'a-b', source: 'a', target: 'b' }];
      const result = xyflowToWorkflowGraph(flowNodes, flowEdges, {
        schema_version: 1,
        id: null,
        name: 'g',
      });
      expect(result.edges).toEqual([
        { from_node: 'a', from_port: 'main', to_node: 'b', to_port: 'main' },
      ]);
    });

    it('returns an empty graph for empty nodes/edges', () => {
      const result = xyflowToWorkflowGraph([], [], { schema_version: 1, id: undefined, name: '' });
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });

  describe('autoLayout', () => {
    it('returns an empty map for no nodes', () => {
      expect(autoLayout([], []).size).toBe(0);
    });

    it('lays out a linear chain by BFS depth from the trigger', () => {
      const nodes = [node({ id: 't', kind: 'trigger' }), node({ id: 'a' }), node({ id: 'b' })];
      const edges = [
        edge({ from_node: 't', to_node: 'a' }),
        edge({ from_node: 'a', to_node: 'b' }),
      ];
      const positions = autoLayout(nodes, edges);
      expect(positions.get('t')).toEqual({ x: 0, y: 0 });
      expect(positions.get('a')).toEqual({ x: 0, y: 160 });
      expect(positions.get('b')).toEqual({ x: 0, y: 320 });
    });

    it('places parallel branches at the same depth in separate columns', () => {
      const nodes = [node({ id: 't', kind: 'trigger' }), node({ id: 'a' }), node({ id: 'b' })];
      const edges = [
        edge({ from_node: 't', to_node: 'a' }),
        edge({ from_node: 't', to_node: 'b' }),
      ];
      const positions = autoLayout(nodes, edges);
      expect(positions.get('t')).toEqual({ x: 0, y: 0 });
      expect(positions.get('a')).toEqual({ x: 0, y: 160 });
      expect(positions.get('b')).toEqual({ x: 280, y: 160 });
    });

    it('gives every node a position, even a fully disconnected graph', () => {
      const nodes = [node({ id: 'a' }), node({ id: 'b' })];
      const positions = autoLayout(nodes, []);
      expect(positions.size).toBe(2);
      expect(positions.has('a')).toBe(true);
      expect(positions.has('b')).toBe(true);
    });

    it('does not throw on an edge referencing an id outside the node set', () => {
      const nodes = [node({ id: 'a' })];
      const edges = [edge({ from_node: 'a', to_node: 'ghost' })];
      expect(() => autoLayout(nodes, edges)).not.toThrow();
      expect(autoLayout(nodes, edges).get('a')).toEqual({ x: 0, y: 0 });
    });
  });

  describe('edgeId', () => {
    it('composes from_node-from_port-to_node-to_port', () => {
      expect(edgeId(edge({ from_node: 'x', from_port: 'p1', to_node: 'y', to_port: 'p2' }))).toBe(
        'x-p1-y-p2'
      );
    });
  });
});
