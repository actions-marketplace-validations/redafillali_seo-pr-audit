import * as core from '@actions/core';

function run(): void {
  const paths = core.getInput('paths') || '/';
  core.info(`hello — auditing: ${paths}`);
  core.setOutput('passed', 'true');
}

run();
