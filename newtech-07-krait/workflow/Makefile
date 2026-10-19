# Workflow example for Episode 7: a finding is closed only when its exploit test exists,
# passes against the vulnerable commit and fails after the fix.
close-finding:
	git stash && forge test --match-test 'test_exploit_$(ID)'          # must PASS: the bug is real
	git stash pop && ! forge test --match-test 'test_exploit_$(ID)'    # must FAIL: the fix holds
