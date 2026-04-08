"""
Circuit Breaker Pattern Implementation
Provides resilience against cascading failures from API dependencies
"""

import time
import logging
from enum import Enum
from typing import Callable, Any, Dict, Optional
from dataclasses import dataclass
import asyncio

class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "CLOSED"      # Normal operation
    OPEN = "OPEN"          # Blocking calls due to failures
    HALF_OPEN = "HALF_OPEN"  # Testing if service recovered

@dataclass
class CircuitBreakerConfig:
    """Circuit breaker configuration"""
    failure_threshold: int = 5         # Number of failures before opening
    success_threshold: int = 2         # Number of successes to close from half-open
    timeout_duration: int = 60         # Seconds to wait before trying half-open
    failure_rate_threshold: float = 0.5  # Failure rate threshold (0.0-1.0)
    min_request_threshold: int = 10    # Minimum requests before calculating failure rate

class CircuitBreakerException(Exception):
    """Exception raised when circuit breaker is open"""
    pass

class CircuitBreaker:
    """Circuit breaker implementation for API resilience"""
    
    def __init__(self, name: str, config: CircuitBreakerConfig = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        
        # Metrics tracking
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        self.request_count = 0
        self.total_requests = 0
        
        # Rolling window for failure rate calculation
        self.recent_results = []  # [(timestamp, success), ...]
        self.window_duration = 60  # 1 minute rolling window
        
        self.logger = logging.getLogger(f"{__name__}.{name}")
        self.logger.info(f"Circuit breaker '{name}' initialized with config: {self.config}")
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function through circuit breaker"""
        
        # Check if circuit is open
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self._transition_to_half_open()
            else:
                self._record_blocked_call()
                raise CircuitBreakerException(
                    f"Circuit breaker '{self.name}' is OPEN. "
                    f"Last failure: {self.last_failure_time}. "
                    f"Will retry after {self.config.timeout_duration}s"
                )
        
        # Execute the function
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
            
        except Exception as e:
            self._on_failure()
            raise  # Re-raise the original exception
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset"""
        return (
            self.last_failure_time and 
            time.time() - self.last_failure_time >= self.config.timeout_duration
        )
    
    def _transition_to_half_open(self):
        """Transition circuit to half-open state"""
        self.state = CircuitState.HALF_OPEN
        self.success_count = 0
        self.logger.info(f"Circuit breaker '{self.name}' transitioned to HALF_OPEN")
    
    def _on_success(self):
        """Handle successful call"""
        current_time = time.time()
        self.failure_count = 0
        self.request_count += 1
        self.total_requests += 1
        
        # Add to rolling window
        self._add_to_rolling_window(current_time, success=True)
        
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.config.success_threshold:
                self._transition_to_closed()
        
        self.logger.debug(f"Success recorded for '{self.name}'. State: {self.state.value}")
    
    def _on_failure(self):
        """Handle failed call"""
        current_time = time.time()
        self.failure_count += 1
        self.last_failure_time = current_time
        self.request_count += 1
        self.total_requests += 1
        self.success_count = 0  # Reset success count
        
        # Add to rolling window
        self._add_to_rolling_window(current_time, success=False)
        
        # Check if we should open the circuit
        if self._should_open_circuit():
            self._transition_to_open()
        
        self.logger.warning(
            f"Failure recorded for '{self.name}'. "
            f"Count: {self.failure_count}/{self.config.failure_threshold}. "
            f"State: {self.state.value}"
        )
    
    def _should_open_circuit(self) -> bool:
        """Determine if circuit should be opened"""
        # Check failure count threshold
        if self.failure_count >= self.config.failure_threshold:
            return True
        
        # Check failure rate if we have enough requests
        if self.total_requests >= self.config.min_request_threshold:
            failure_rate = self._calculate_failure_rate()
            if failure_rate >= self.config.failure_rate_threshold:
                self.logger.warning(
                    f"Failure rate {failure_rate:.2%} exceeds threshold "
                    f"{self.config.failure_rate_threshold:.2%} for '{self.name}'"
                )
                return True
        
        return False
    
    def _transition_to_open(self):
        """Transition circuit to open state"""
        self.state = CircuitState.OPEN
        self.logger.error(
            f"Circuit breaker '{self.name}' OPENED due to {self.failure_count} failures. "
            f"Will attempt reset after {self.config.timeout_duration}s"
        )
    
    def _transition_to_closed(self):
        """Transition circuit to closed state"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.logger.info(f"Circuit breaker '{self.name}' reset to CLOSED")
    
    def _add_to_rolling_window(self, timestamp: float, success: bool):
        """Add result to rolling window for failure rate calculation"""
        self.recent_results.append((timestamp, success))
        
        # Remove old entries outside the window
        cutoff_time = timestamp - self.window_duration
        self.recent_results = [
            (ts, result) for ts, result in self.recent_results 
            if ts >= cutoff_time
        ]
    
    def _calculate_failure_rate(self) -> float:
        """Calculate current failure rate from rolling window"""
        if not self.recent_results:
            return 0.0
        
        total_requests = len(self.recent_results)
        failed_requests = sum(1 for _, success in self.recent_results if not success)
        
        return failed_requests / total_requests
    
    def _record_blocked_call(self):
        """Record that a call was blocked by open circuit"""
        self.logger.debug(f"Call blocked by open circuit breaker '{self.name}'")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current circuit breaker metrics"""
        current_failure_rate = self._calculate_failure_rate()
        
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "total_requests": self.total_requests,
            "failure_rate": current_failure_rate,
            "last_failure_time": self.last_failure_time,
            "recent_requests": len(self.recent_results),
            "config": {
                "failure_threshold": self.config.failure_threshold,
                "success_threshold": self.config.success_threshold,
                "timeout_duration": self.config.timeout_duration,
                "failure_rate_threshold": self.config.failure_rate_threshold
            }
        }
    
    def reset(self):
        """Manually reset circuit breaker to closed state"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        self.recent_results = []
        self.logger.info(f"Circuit breaker '{self.name}' manually reset")


class CircuitBreakerManager:
    """Manages multiple circuit breakers"""
    
    def __init__(self):
        self.circuit_breakers: Dict[str, CircuitBreaker] = {}
        self.logger = logging.getLogger(__name__)
    
    def get_circuit_breaker(
        self, 
        name: str, 
        config: CircuitBreakerConfig = None
    ) -> CircuitBreaker:
        """Get or create circuit breaker for service"""
        if name not in self.circuit_breakers:
            self.circuit_breakers[name] = CircuitBreaker(name, config)
            self.logger.info(f"Created new circuit breaker: '{name}'")
        
        return self.circuit_breakers[name]
    
    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Get metrics for all circuit breakers"""
        return {
            name: cb.get_metrics() 
            for name, cb in self.circuit_breakers.items()
        }
    
    def reset_all(self):
        """Reset all circuit breakers"""
        for cb in self.circuit_breakers.values():
            cb.reset()
        self.logger.info("All circuit breakers reset")
    
    def get_health_summary(self) -> Dict[str, Any]:
        """Get overall health summary"""
        metrics = self.get_all_metrics()
        
        total_breakers = len(metrics)
        open_breakers = sum(1 for m in metrics.values() if m["state"] == "OPEN")
        half_open_breakers = sum(1 for m in metrics.values() if m["state"] == "HALF_OPEN")
        
        return {
            "total_circuit_breakers": total_breakers,
            "open": open_breakers,
            "half_open": half_open_breakers,
            "closed": total_breakers - open_breakers - half_open_breakers,
            "overall_health": "healthy" if open_breakers == 0 else "degraded" if open_breakers < total_breakers else "critical"
        }


# Global circuit breaker manager instance
circuit_breaker_manager = CircuitBreakerManager()


def with_circuit_breaker(name: str, config: CircuitBreakerConfig = None):
    """Decorator to apply circuit breaker to async functions"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            cb = circuit_breaker_manager.get_circuit_breaker(name, config)
            return await cb.call(func, *args, **kwargs)
        return wrapper
    return decorator


# Example usage:
if __name__ == "__main__":
    async def example_api_call():
        """Example API call that might fail"""
        import random
        if random.random() < 0.3:  # 30% failure rate
            raise Exception("API call failed")
        return {"status": "success"}
    
    async def test_circuit_breaker():
        """Test circuit breaker functionality"""
        cb = CircuitBreaker("test_api")
        
        for i in range(20):
            try:
                result = await cb.call(example_api_call)
                print(f"Call {i+1}: Success - {result}")
            except Exception as e:
                print(f"Call {i+1}: Failed - {e}")
            
            await asyncio.sleep(0.1)  # Brief pause between calls
        
        # Print final metrics
        metrics = cb.get_metrics()
        print(f"\nFinal metrics: {metrics}")
    
    # Run test
    asyncio.run(test_circuit_breaker())