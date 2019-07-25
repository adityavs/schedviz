//
// Copyright 2019 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
//
/**
 * A CPU selection fragment is either a single decimal number or a range
 * specified by two decimal numbers separated by a hyphen.
 */
const CPU_SELECTION_REGEX = new RegExp(`^([0-9]+)(\-([0-9]+))?$`);

import {Viewport} from './viewport';

/**
 * CpuLabel encapsulates the labeling for a single CPU in a possibly-multicore
 * system.  It is generated by a SystemTopology object, and knows its place
 * within that topology.
 */
export class CpuLabel {
  constructor(public cpuIndex: number, public totalCpuCount: number) {}

  /**
   * @return This CPUs location within the host, i.e. its topological row.
   */
  get locationInHost(): number {
    return this.cpuIndex;
  }

  /**
   * @return a label for this CPU.
   */
  get label(): string {
    const maxIdLen = String(this.totalCpuCount - 1).length;
    const id = String(this.cpuIndex);
    // Pad on the left w/ enough 0s to make it as long as the longest CPU
    // id.
    const cpuString = '0'.repeat(maxIdLen - id.length) + id;
    return 'CPU ' + cpuString;
  }
}

/**
 * Provides utilities for working with system topologies and CPUs,
 * including text filtering of CPU sets.
 * Version specific to internal architectures.
 */
export class SystemTopology {
  protected cpuLabels: CpuLabel[];
  constructor(public cpus: number[]) {
    this.cpuLabels = cpus.map(cpu => new CpuLabel(cpu, cpus.length));
  }

  getVisibleCpuIds(viewport: Viewport, filter?: string) {
    const cpus = this.getSortedFilteredCpuIds(filter);
    const cpuCount = cpus.length;
    // Compute range of visible cpu rows from the viewport.
    const rowMin = Math.floor(viewport.top * cpuCount);
    const rowMax = Math.ceil(viewport.bottom * cpuCount);
    // Grab subset for cpus
    return cpus.slice(rowMin, rowMax + 1);
  }

  get cpuCount() {
    return this.cpuLabels.length;
  }

  /**
   * Given a CPU selection string, returns the set of valid CPU IDs in this
   * topology selected by that string.
   * @return A set of selected CPU IDs.
   */
  private expandCpuSelection(cpuSelectionString?: string): Set<number> {
    if (!cpuSelectionString) {
      return new Set(this.cpuLabels.map((cpuLabel) => cpuLabel.cpuIndex));
    }
    const cpuIds = new Set<number>();
    for (const part of cpuSelectionString.split(',')) {
      const match = part.trim().match(CPU_SELECTION_REGEX);
      if (!match) {
        return cpuIds;
      } else if (!match[3]) {
        // match[1] contains the individual CPU selected.
        const value = +match[1];
        cpuIds.add(value);
      } else {
        // match[1] contains range start; match[3] contains range end.
        const begin = +match[1];
        const end = +match[3];
        const spread = end - begin + 1;
        if (spread <= 0) {
          continue;
        }
        for (let cpuNum = begin; cpuNum < begin + spread; cpuNum++) {
          cpuIds.add(cpuNum);
        }
      }
    }
    return cpuIds;
  }

  /**
   * Takes a CPU selection string and returns an array of CpuLabels selected
   * by that string within this system topology.  If an empty array is
   * returned, the selection string was invalid.
   */
  getSortedFilteredCpuLabels(cpuSelectionString?: string): CpuLabel[] {
    if (!cpuSelectionString) {
      return this.cpuLabels;
    }
    const cpuIDs = this.expandCpuSelection(cpuSelectionString);
    return this.cpuLabels.filter((cpuLabel) => cpuIDs.has(cpuLabel.cpuIndex));
  }

  /**
   * Takes a CPU selection string and returns an array of cpu ids selected
   * by that string within this system topology.  If an empty array is
   * returned, the selection string was invalid.
   */
  getSortedFilteredCpuIds(cpuSelectionString?: string): number[] {
    return this.getSortedFilteredCpuLabels(cpuSelectionString)
        .map(label => label.cpuIndex);
  }

  /**
   * @return The sort order index for the given cpu id and filter
   */
  getRow(cpuId: number, cpuSelectionString?: string): number {
    const row = this.getSortedFilteredCpuIds(cpuSelectionString).indexOf(cpuId);
    return row !== -1 ? row : cpuId;
  }

  /**
   * Takes a CPU selection string and returns an equivalent but prettified one.
   * This 'prettification' involves sorting selected CPUs and merging
   * contiguous spans of CPUs into x-y ranges.
   * @return The prettified selection string.
   */
  prettifyCpuSelection(cpuSelectionString: string): string {
    const cpuIDs = this.expandCpuSelection(cpuSelectionString);
    if (!cpuIDs) {
      return '';
    }
    const newCpuSelectionStrings: string[] = [];
    let lastCpuID = -1;
    let lastRangeStart = -1;
    const addSelectionPart = (lastCpuID: number, lastRangeStart: number) => {
      if (lastRangeStart === lastCpuID) {
        newCpuSelectionStrings.push(`${lastCpuID}`);
      } else {
        newCpuSelectionStrings.push(`${lastRangeStart}-${lastCpuID}`);
      }
    };
    Array.from(cpuIDs).sort((a, b) => a - b).forEach((cpuID) => {
      // Upon encountering a discontinuity, emit either a single CPU ID or a
      // range.
      if (lastRangeStart !== -1 && lastCpuID !== -1 && lastCpuID + 1 < cpuID) {
        addSelectionPart(lastCpuID, lastRangeStart);
        lastRangeStart = -1;
      }
      if (lastRangeStart === -1) {
        lastRangeStart = cpuID;
      }
      lastCpuID = cpuID;
    });
    if (lastRangeStart !== -1 && lastCpuID !== -1) {
      addSelectionPart(lastCpuID, lastRangeStart);
    }
    return newCpuSelectionStrings.join(',');
  }


  /**
   * Takes a CPU selection string and returns an equivalent but canonicalized
   * one.
   */
  canonicalizeCpuFilterString(cpuSelectionString: string): string {
    // All others: remove whitespace.
    return cpuSelectionString.replace(/\s+/g, '');
  }
}
